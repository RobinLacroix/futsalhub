-- ═════════════════════════════════════════════════════════════════════════════
-- LOT A (socle) — Disponibilité des joueurs et rôle `medical`
--
-- À jouer dans le SQL Editor encadré par BEGIN; / COMMIT;
--
-- Cette migration crée la STRUCTURE seulement. La normalisation des données
-- (`players.status = 'Blessé'` -> ligne `player_availability`) fait l'objet
-- d'une migration séparée, à jouer APRÈS le déploiement du code qui cesse
-- d'émettre ces valeurs. C'est la leçon de `20260804100000_normalize_strong_foot`
-- reprise telle quelle : réparer des données que le code continue de produire ne
-- sert à rien.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Trois décisions prises contre le premier jet de la spec, après lecture de la
-- base réelle. Elles ne sont pas des détails.
--
-- 1. `side` vaut 'L' / 'R' / 'C', PAS 'left' / 'right' / 'none'.
--    `pain_reports.side` utilise déjà 'L'/'R'/'C', et `lib/painMap.ts` remplit
--    cette colonne depuis la définition de la zone (`toPayload` : `z?.side`).
--    Inventer un troisième vocabulaire ici aurait créé la table de
--    correspondance que la spec voulait justement éviter.
--
-- 2. L'identifiant de zone FAIT FOI, `side` n'en est qu'une copie.
--    Les zones encodent déjà le côté (`hamstring_l`, `shoulder_r`). `side`
--    existe pour filtrer et agréger sans parser une chaîne ; il doit rester
--    cohérent avec la zone, jamais la contredire. Une zone centrale ('C')
--    comme l'aine n'a pas de côté.
--
-- 3. Le rôle `medical` est ajouté à `has_club_access`, contrairement à la
--    lettre du critère « voit la page Performance et rien d'autre ».
--    Sans cet accès en lecture, un membre `medical` ne peut pas lire la table
--    `players` : l'infirmerie afficherait des identifiants sans noms. Lui
--    donner une lecture club (au niveau d'un `viewer`) et lui refuser toute
--    écriture sportive est le compromis honnête. Restreindre réellement sa
--    lecture au périmètre santé demanderait de re-scoper chaque policy de la
--    base : c'est un chantier de sécurité, pas un socle de feature.
--    `has_club_write_access` reste donc à ('admin','coach').
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le type énuméré
-- ─────────────────────────────────────────────────────────────────────────────
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'availability_status'
  ) THEN
    CREATE TYPE public.availability_status AS ENUM (
      'disponible',         -- apte, sans restriction
      'amenage',            -- apte, charge ou contenu aménagé
      'reprise_collective', -- réintègre le groupe, pas encore la compétition
      'reathletisation',    -- travail individuel avec le prépa physique
      'soins',              -- indisponible, en traitement
      'indisponible',       -- indisponible, hors soins (perso, pro, non justifié)
      'suspendu'            -- indisponible, décision disciplinaire ou sportive
    );
  END IF;
END
$mig$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La table
--
-- Historisée par `ended_at`, jamais écrasée : « combien de jours Untel a-t-il
-- manqué cette saison » et « combien de rechutes sur la même zone » sont deux
-- questions que le prépa physique posera dès la deuxième semaine, et l'écrasement
-- les rend toutes les deux impossibles à répondre.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.player_availability (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id            uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id              uuid NOT NULL REFERENCES public.clubs(id)   ON DELETE CASCADE,
  status               public.availability_status NOT NULL,
  since                date NOT NULL DEFAULT current_date,
  expected_return_date date,
  return_confidence    text CHECK (return_confidence IN ('estimee','confirmee')),
  -- Identifiant de zone de `lib/painMap.ts` (ex 'hamstring_l'). Pas de clé
  -- étrangère : le référentiel de zones vit dans le code, pas en base.
  zone                 text,
  side                 text CHECK (side IN ('L','R','C')),
  injury_event_id      uuid REFERENCES public.player_events(id) ON DELETE SET NULL,
  note                 text,
  updated_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz  -- NULL = ligne courante
);

-- Un seul état courant par joueur. C'est cet index qui oblige
-- `set_player_availability` à clôturer avant d'ouvrir.
CREATE UNIQUE INDEX IF NOT EXISTS player_availability_current
  ON public.player_availability (player_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS player_availability_club_open
  ON public.player_availability (club_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS player_availability_player_history
  ON public.player_availability (player_id, since DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Le club est déduit du joueur, jamais fourni par l'appelant
--
-- `players.club_id` est NULLABLE en base. Le repo documente ailleurs que le club
-- s'hérite via `team_id -> teams.club_id` ; on applique la même règle en repli
-- plutôt que de refuser un joueur au rattachement incomplet.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_availability_fill_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT COALESCE(p.club_id, t.club_id)
    INTO v_club_id
    FROM public.players p
    LEFT JOIN public.teams t ON t.id = p.team_id
   WHERE p.id = NEW.player_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION
      'Joueur % sans club : ni players.club_id ni son equipe ne le rattachent.',
      NEW.player_id;
  END IF;

  NEW.club_id := v_club_id;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.player_availability_fill_club() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS player_availability_fill_club ON public.player_availability;
CREATE TRIGGER player_availability_fill_club
  BEFORE INSERT OR UPDATE OF player_id ON public.player_availability
  FOR EACH ROW EXECUTE FUNCTION public.player_availability_fill_club();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Le rôle `medical`
--
-- Un rôle ajouté au CHECK mais absent d'une garde `IN (...)` produit un membre
-- qui ne voit rien, sans la moindre erreur. Les deux CHECK et les trois gardes
-- concernées sont donc modifiés ensemble, dans cette section.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.club_members     DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE public.club_members
  ADD CONSTRAINT club_members_role_check
  CHECK (role IN ('admin','coach','viewer','medical'));

ALTER TABLE public.club_invitations DROP CONSTRAINT IF EXISTS club_invitations_role_check;
ALTER TABLE public.club_invitations
  ADD CONSTRAINT club_invitations_role_check
  CHECK (role IN ('admin','coach','viewer','medical'));

-- Lecture club : `medical` rejoint `viewer`. Voir la décision 3 en tête de
-- fichier — sans ça, l'infirmerie n'a pas le droit de lire les noms.
CREATE OR REPLACE FUNCTION public.has_club_access(p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p_club_id
      AND cm.role IN ('admin', 'coach', 'viewer', 'medical')
  );
END;
$fn$;

-- Écriture des données de SANTÉ : admin, coach, staff médical. Volontairement
-- distincte de `has_club_write_access` (admin/coach), qui reste la garde des
-- données sportives : un kiné n'a rien à faire dans une composition d'équipe.
CREATE OR REPLACE FUNCTION public.has_club_medical_access(p_club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR p_club_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p_club_id
      AND cm.role IN ('admin', 'coach', 'medical')
  );
END;
$fn$;

-- Lecture des données de santé d'un joueur : l'encadrement, le staff médical,
-- et le joueur lui-même. `viewer` reste dehors (RGPD art. 9).
CREATE OR REPLACE FUNCTION public.has_player_health_access(p_player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR p_player_id IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.players p
    WHERE p.id = p_player_id AND p.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.players p
      JOIN public.club_members cm ON cm.club_id = COALESCE(
             p.club_id, (SELECT t.club_id FROM public.teams t WHERE t.id = p.team_id))
     WHERE p.id = p_player_id
       AND cm.user_id = auth.uid()
       AND cm.role IN ('admin','coach','medical')
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.has_club_access(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_club_medical_access(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_player_health_access(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_club_access(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_club_medical_access(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_player_health_access(uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
--
-- Aucune policy n'est créée depuis l'interface Supabase : ses gabarits
-- produisent des `USING (true)`, et les policies permissives se combinent en OU,
-- donc une seule policy ouverte annule toutes les autres.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_availability FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.player_availability FROM PUBLIC, anon;

-- SELECT seulement. Toute écriture passe par `set_player_availability` : elle
-- seule sait clôturer l'état courant avant d'en ouvrir un autre, et l'index
-- unique partiel fait échouer quiconque tente l'insertion à la main. Les
-- policies d'écriture sont conservées quand même : le jour où un GRANT est
-- ajouté par mégarde, elles refusent au lieu de laisser passer.
GRANT SELECT ON TABLE public.player_availability TO authenticated;

DROP POLICY IF EXISTS player_availability_select ON public.player_availability;
CREATE POLICY player_availability_select
  ON public.player_availability FOR SELECT TO authenticated
  USING (public.has_player_health_access(player_id));

DROP POLICY IF EXISTS player_availability_insert ON public.player_availability;
CREATE POLICY player_availability_insert
  ON public.player_availability FOR INSERT TO authenticated
  WITH CHECK (public.has_club_medical_access(club_id));

DROP POLICY IF EXISTS player_availability_update ON public.player_availability;
CREATE POLICY player_availability_update
  ON public.player_availability FOR UPDATE TO authenticated
  USING (public.has_club_medical_access(club_id))
  WITH CHECK (public.has_club_medical_access(club_id));

DROP POLICY IF EXISTS player_availability_delete ON public.player_availability;
CREATE POLICY player_availability_delete
  ON public.player_availability FOR DELETE TO authenticated
  USING (public.has_club_medical_access(club_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Écriture du statut : clôture et ouverture dans le même appel
--
-- L'index unique partiel refuse deux lignes courantes pour un joueur. Ouvrir
-- avant de clôturer échoue donc, et clôturer sans rouvrir laisse le joueur sans
-- état. Une fonction PL/pgSQL est atomique : les deux écritures réussissent ou
-- aucune. C'est la seule façon correcte de passer d'un statut à l'autre, et
-- l'application ne doit jamais écrire la table directement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_player_availability(
  p_player_id        uuid,
  p_status           public.availability_status,
  p_since            date    DEFAULT current_date,
  p_expected_return  date    DEFAULT NULL,
  p_return_confidence text   DEFAULT NULL,
  p_zone             text    DEFAULT NULL,
  p_side             text    DEFAULT NULL,
  p_note             text    DEFAULT NULL,
  p_injury_event_id  uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_club_id uuid;
  v_new_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise.';
  END IF;

  SELECT COALESCE(p.club_id, t.club_id)
    INTO v_club_id
    FROM public.players p
    LEFT JOIN public.teams t ON t.id = p.team_id
   WHERE p.id = p_player_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Joueur introuvable ou sans club : %', p_player_id;
  END IF;

  IF NOT public.has_club_medical_access(v_club_id) THEN
    RAISE EXCEPTION 'Acces refuse : reserve a l''encadrement et au staff medical.';
  END IF;

  -- Clôture de l'état courant. `since` de la nouvelle ligne fait foi pour la
  -- date de fin : un kiné qui saisit lundi une reprise datée de samedi doit
  -- produire un historique cohérent, pas une ligne close le lundi.
  UPDATE public.player_availability
     SET ended_at = GREATEST(created_at, (p_since)::timestamptz)
   WHERE player_id = p_player_id AND ended_at IS NULL;

  INSERT INTO public.player_availability (
    player_id, club_id, status, since, expected_return_date, return_confidence,
    zone, side, injury_event_id, note, updated_by
  ) VALUES (
    p_player_id, v_club_id, p_status, COALESCE(p_since, current_date),
    p_expected_return, p_return_confidence,
    p_zone, p_side, p_injury_event_id, p_note, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.set_player_availability(uuid, public.availability_status, date, date, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_player_availability(uuid, public.availability_status, date, date, text, text, text, text, uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Lecture : état courant du club
--
-- Renvoie une ligne par joueur AYANT un état enregistré. Un joueur sans ligne
-- est implicitement disponible : c'est volontaire, ça évite d'écrire une ligne
-- « disponible » pour tout l'effectif au démarrage. L'application complète.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_club_availability(
  p_club_id uuid,
  p_team_id uuid DEFAULT NULL
)
RETURNS TABLE (
  player_id            uuid,
  first_name           text,
  last_name            text,
  number               integer,
  team_id              uuid,
  status               public.availability_status,
  since                date,
  days_out             integer,
  expected_return_date date,
  days_until_return    integer,
  return_confidence    text,
  zone                 text,
  side                 text,
  note                 text,
  -- Quand ce statut a été enregistré, pas quand la ligne a été modifiée : une
  -- ligne d'historique ne se modifie pas, elle se clôture.
  recorded_at          timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.number,
    p.team_id,
    a.status,
    a.since,
    (current_date - a.since)::integer,
    a.expected_return_date,
    CASE WHEN a.expected_return_date IS NULL THEN NULL
         ELSE (a.expected_return_date - current_date)::integer END,
    a.return_confidence,
    a.zone,
    a.side,
    a.note,
    a.created_at
  FROM public.player_availability a
  JOIN public.players p ON p.id = a.player_id
  WHERE a.ended_at IS NULL
    AND a.club_id = p_club_id
    AND (p_team_id IS NULL OR p.team_id = p_team_id)
  ORDER BY
    -- Les retours les plus proches en premier ; les retours inconnus ferment la
    -- marche : c'est l'ordre dans lequel un coach prépare sa semaine.
    a.expected_return_date NULLS LAST,
    a.since;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_club_availability(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_availability(uuid, uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Lecture : historique d'un joueur
--
-- `p_from` plutôt que `p_season` : la table ne porte pas de saison, et parser
-- « 2025-2026 » en SQL demanderait un utilitaire de plus. L'application connaît
-- déjà ses bornes de saison, elle passe une date.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_availability_history(
  p_player_id uuid,
  p_from      date DEFAULT NULL
)
RETURNS TABLE (
  id                   uuid,
  status               public.availability_status,
  since                date,
  ended_at             timestamptz,
  days_elapsed         integer,
  expected_return_date date,
  return_confidence    text,
  zone                 text,
  side                 text,
  note                 text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_player_health_access(p_player_id) THEN
    RAISE EXCEPTION 'Acces refuse aux donnees de sante du joueur %', p_player_id;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.status,
    a.since,
    a.ended_at,
    (COALESCE(a.ended_at::date, current_date) - a.since)::integer,
    a.expected_return_date,
    a.return_confidence,
    a.zone,
    a.side,
    a.note
  FROM public.player_availability a
  WHERE a.player_id = p_player_id
    AND (p_from IS NULL OR a.since >= p_from)
  ORDER BY a.since DESC, a.created_at DESC;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_player_availability_history(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_availability_history(uuid, date) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Signaux précoces
--
-- N signalements sur la même zone et le même côté, pour le même joueur, sur une
-- fenêtre glissante. C'est un SIGNAL, jamais un diagnostic : la fonction
-- renvoie des comptes et des dates, elle ne qualifie rien. L'écran doit écrire
-- « 4 signalements ischio gauche en 18 jours » et surtout pas « risque de
-- lésion ».
--
-- `pain_reports` ne porte pas de club : on remonte par le joueur, avec le même
-- repli `players.club_id -> teams.club_id` que partout ailleurs ici.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pain_signals(
  p_club_id      uuid,
  p_window_days  integer DEFAULT 21,
  p_min_reports  integer DEFAULT 3
)
RETURNS TABLE (
  player_id      uuid,
  first_name     text,
  last_name      text,
  zone           text,
  side           text,
  report_count   integer,
  avg_intensity  numeric,
  max_intensity  smallint,
  first_reported timestamptz,
  last_reported  timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  IF p_window_days IS NULL OR p_window_days < 1 THEN
    RAISE EXCEPTION 'Fenetre invalide : %', p_window_days;
  END IF;
  IF p_min_reports IS NULL OR p_min_reports < 2 THEN
    RAISE EXCEPTION 'Seuil invalide : % (au moins 2 signalements)', p_min_reports;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    r.zone,
    r.side,
    COUNT(*)::integer,
    ROUND(AVG(r.intensity)::numeric, 1),
    MAX(r.intensity),
    MIN(r.reported_at),
    MAX(r.reported_at)
  FROM public.pain_reports r
  JOIN public.players p ON p.id = r.player_id
  LEFT JOIN public.teams t ON t.id = p.team_id
  WHERE COALESCE(p.club_id, t.club_id) = p_club_id
    AND r.reported_at >= now() - make_interval(days => p_window_days)
  GROUP BY p.id, p.first_name, p.last_name, r.zone, r.side
  HAVING COUNT(*) >= p_min_reports
  ORDER BY COUNT(*) DESC, MAX(r.reported_at) DESC;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_pain_signals(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pain_signals(uuid, integer, integer) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Garde-fou — échoue si un invariant n'est pas tenu
--
-- Un contrôle qui interroge le catalogue attrape ce qu'aucune relecture de code
-- ne voit. Ne pas le neutraliser : lire ce qu'il affiche et arbitrer.
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_count int;
  r RECORD;
BEGIN
  -- RLS active et forcée
  SELECT COUNT(*) INTO v_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'player_availability'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS non activee (ou non forcee) sur player_availability';
  END IF;

  -- Aucune policy ouverte
  FOR r IN
    SELECT policyname, qual, with_check FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'player_availability'
  LOOP
    IF COALESCE(r.qual, '') = 'true' OR COALESCE(r.with_check, '') = 'true' THEN
      RAISE EXCEPTION 'Policy ouverte sur player_availability : %', r.policyname;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'player_availability';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'player_availability : % policies au lieu de 4', v_count;
  END IF;

  -- `anon` ne doit toucher ni la table ni les nouvelles fonctions
  IF has_table_privilege('anon', 'public.player_availability', 'SELECT') THEN
    RAISE EXCEPTION 'anon peut lire player_availability';
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('set_player_availability','get_club_availability',
                         'get_player_availability_history','get_pain_signals',
                         'has_club_medical_access','has_player_health_access',
                         'has_club_access')
  LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon peut executer %', r.sig;
    END IF;
  END LOOP;

  -- Le rôle `medical` doit être accepté par les deux CHECK. Un SELECT ne
  -- déclencherait aucune contrainte : on lit la définition dans le catalogue.
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid IN ('public.club_members'::regclass,
                          'public.club_invitations'::regclass)
       AND c.conname IN ('club_members_role_check','club_invitations_role_check')
  LOOP
    IF r.def NOT LIKE '%medical%' THEN
      RAISE EXCEPTION 'Le CHECK de rôle de % refuse la valeur medical : %', r.tbl, r.def;
    END IF;
  END LOOP;

  -- Et les gardes doivent connaître le rôle, sinon un membre `medical` ne voit
  -- rien du tout sans qu'aucune erreur ne soit levée.
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'has_club_access')
     NOT LIKE '%medical%' THEN
    RAISE EXCEPTION 'has_club_access ignore le role medical';
  END IF;

  -- `viewer` ne doit JAMAIS entrer dans une garde de données de santé.
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('has_club_medical_access','has_player_health_access')
  LOOP
    IF r.def LIKE '%viewer%' THEN
      RAISE EXCEPTION '% laisse passer viewer sur des donnees de sante', r.proname;
    END IF;
  END LOOP;

  -- Les 7 valeurs de l'énumération
  SELECT COUNT(*) INTO v_count
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'availability_status';
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'availability_status : % valeurs au lieu de 7', v_count;
  END IF;

  RAISE NOTICE 'player_availability : structure, RLS et RPC verifiees.';
END
$mig$;
