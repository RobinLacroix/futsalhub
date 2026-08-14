-- ═════════════════════════════════════════════════════════════════════════════
-- LOT B — Tests physiques
--
-- Spec : livrables/futsalhub/SPEC_FEATURES_BETA_2026-08.md §4
--
-- Trois tables. Un catalogue système partagé (club_id NULL), des campagnes de
-- test rattachées ou non à une séance, et des résultats à plusieurs essais.
--
-- LE POINT QUI DÉCIDE DE TOUT : la colonne `direction`. Un chrono bas est une
-- BONNE performance, une détente basse est mauvaise. Sans cette colonne, la
-- moitié du catalogue s'affiche en couleurs inversées et les progressions sont
-- calculées à l'envers. Même famille de bug que le RPE coloré comme un jugement
-- (cf. components/player/ScaleSelector.tsx) : avant de colorer une échelle,
-- vérifier ce que la métrique veut dire.
--
-- DONNÉE DE SANTÉ. Les tests physiques et l'anthropométrie sont de la donnée de
-- santé au sens du RGPD art. 9, avec des mineurs dans le périmètre dès qu'un
-- club a une académie. La lecture n'est donc PAS ouverte à `has_club_access`,
-- qui laisse passer le rôle `viewer`. Elle passe par une primitive dédiée,
-- has_player_health_access, introduite ici et réutilisable par le lot A
-- (disponibilité, infirmerie).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Primitive d'accès aux données de santé d'un joueur
--
-- Vraie : le joueur lui-même, ou un membre admin/coach du club du joueur.
-- Fausse pour `viewer`, et fausse pour un appelant non authentifié (garde
-- explicite : auth.uid() vaut NULL pour anon, et une comparaison avec NULL
-- ne déclenche aucun IF — c'est le défaut corrigé en masse le 2026-08-03).
--
-- Portée CLUB et non ÉQUIPE, volontairement : Robin entraîne A et B, et le
-- staff médical d'un club amateur suit tout l'effectif. Resserrable à l'équipe
-- plus tard sans changer les appelants.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_player_health_access(p_player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR p_player_id IS NULL THEN
    RETURN false;
  END IF;

  -- Le joueur consulte ses propres données.
  IF EXISTS (
    SELECT 1 FROM public.players p
     WHERE p.id = p_player_id AND p.user_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  -- Staff du club, en excluant `viewer`.
  RETURN EXISTS (
    SELECT 1
      FROM public.players p
      JOIN public.club_members cm ON cm.club_id = p.club_id
     WHERE p.id = p_player_id
       AND cm.user_id = auth.uid()
       AND cm.role IN ('admin', 'coach')
  );
END
$fn$;

REVOKE ALL     ON FUNCTION public.has_player_health_access(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_player_health_access(uuid) TO authenticated;

COMMENT ON FUNCTION public.has_player_health_access(uuid) IS
  'Garde de lecture des donnees de sante d''un joueur : le joueur lui-meme, ou admin/coach de son club. Exclut viewer et anon.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Catalogue des tests
--
-- club_id NULL = test système, livré avec le produit, identique pour tous les
-- clubs et NON MODIFIABLE par eux. Un club peut le désactiver pour lui-même
-- (§2bis) et créer ses propres tests, mais pas redéfinir `sprint_10m` : sinon
-- deux clubs appellent le même code deux protocoles différents et plus rien
-- n'est comparable.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.physical_test_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  code          text NOT NULL,
  label         text NOT NULL,
  category      text NOT NULL CHECK (category IN
                  ('vitesse','agilite','puissance','endurance','mobilite','anthropometrie')),
  unit          text NOT NULL,
  direction     text NOT NULL CHECK (direction IN
                  ('higher_is_better','lower_is_better','neutral')),
  decimals      smallint NOT NULL DEFAULT 2 CHECK (decimals BETWEEN 0 AND 3),
  attempts      smallint NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 10),
  aggregation   text NOT NULL DEFAULT 'best' CHECK (aggregation IN ('best','mean','last')),
  protocol_note text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_test_types_club_code_key UNIQUE NULLS NOT DISTINCT (club_id, code)
);

COMMENT ON COLUMN public.physical_test_types.direction IS
  'lower_is_better pour les chronos, higher_is_better pour les distances et hauteurs, neutral pour poids et taille (aucune couleur de jugement).';
COMMENT ON COLUMN public.physical_test_types.aggregation IS
  'Regle de selection de l''essai retenu quand attempts > 1.';

-- §2bis. Désactivation d'un test système par un club, sans le modifier.
CREATE TABLE IF NOT EXISTS public.physical_test_type_prefs (
  club_id      uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  test_type_id uuid NOT NULL REFERENCES public.physical_test_types(id) ON DELETE CASCADE,
  is_hidden    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (club_id, test_type_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Campagnes de test
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.physical_test_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  training_id uuid REFERENCES public.trainings(id) ON DELETE SET NULL,
  date        date NOT NULL DEFAULT current_date,
  label       text,
  season      varchar(20),
  -- Une performance ne se compare qu'à conditions égales : surface, température,
  -- moment de la séance. Champ libre volontairement, on ne sait pas à l'avance
  -- ce qui comptera.
  conditions  text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS physical_test_sessions_club_date_idx
  ON public.physical_test_sessions (club_id, date DESC);
CREATE INDEX IF NOT EXISTS physical_test_sessions_team_idx
  ON public.physical_test_sessions (team_id);
CREATE INDEX IF NOT EXISTS physical_test_sessions_training_idx
  ON public.physical_test_sessions (training_id) WHERE training_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Résultats
--
-- club_id dénormalisé : la policy RLS le lit à chaque ligne, une jointure vers
-- la campagne à chaque évaluation coûterait cher pour rien.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.physical_test_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.physical_test_sessions(id) ON DELETE CASCADE,
  club_id      uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  test_type_id uuid NOT NULL REFERENCES public.physical_test_types(id) ON DELETE RESTRICT,
  attempt      smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 10),
  value        numeric(8,3) NOT NULL,
  is_retained  boolean NOT NULL DEFAULT true,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_test_results_unique_attempt
    UNIQUE (session_id, player_id, test_type_id, attempt)
);

CREATE INDEX IF NOT EXISTS physical_test_results_player_test_idx
  ON public.physical_test_results (player_id, test_type_id);
CREATE INDEX IF NOT EXISTS physical_test_results_session_idx
  ON public.physical_test_results (session_id);

-- club_id doit suivre celui de la campagne, quoi qu'envoie le client.
CREATE OR REPLACE FUNCTION public.physical_test_results_fill_club()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  SELECT s.club_id INTO NEW.club_id
    FROM public.physical_test_sessions s
   WHERE s.id = NEW.session_id;

  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'Campagne de test introuvable : %', NEW.session_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS physical_test_results_fill_club_trg ON public.physical_test_results;
CREATE TRIGGER physical_test_results_fill_club_trg
  BEFORE INSERT OR UPDATE OF session_id ON public.physical_test_results
  FOR EACH ROW EXECUTE FUNCTION public.physical_test_results_fill_club();

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. Privilèges
--
-- Supabase accorde tout à anon par défaut sur chaque nouvelle table du schéma
-- public. C'est ce défaut qui a laissé la base ouverte jusqu'au 2026-08-03 :
-- on le retire ici, à la création, et pas dans un audit six mois plus tard.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.physical_test_types      FROM anon;
REVOKE ALL ON TABLE public.physical_test_type_prefs FROM anon;
REVOKE ALL ON TABLE public.physical_test_sessions   FROM anon;
REVOKE ALL ON TABLE public.physical_test_results    FROM anon;

GRANT SELECT                         ON TABLE public.physical_test_types      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.physical_test_type_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.physical_test_sessions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.physical_test_results    TO authenticated;

-- Les tests de club passent par les policies ci-dessous, pas par un GRANT global :
-- authenticated a besoin d'écrire ses propres types.
GRANT INSERT, UPDATE, DELETE ON TABLE public.physical_test_types TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §6. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.physical_test_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_test_type_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_test_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_test_results    ENABLE ROW LEVEL SECURITY;

-- --- Catalogue -------------------------------------------------------------
DROP POLICY IF EXISTS physical_test_types_select ON public.physical_test_types;
CREATE POLICY physical_test_types_select
  ON public.physical_test_types FOR SELECT TO authenticated
  USING (club_id IS NULL OR public.has_club_access(club_id));

-- Un test système (club_id NULL) n'est modifiable par aucun client : les trois
-- policies d'écriture exigent un club_id non nul.
DROP POLICY IF EXISTS physical_test_types_insert ON public.physical_test_types;
CREATE POLICY physical_test_types_insert
  ON public.physical_test_types FOR INSERT TO authenticated
  WITH CHECK (club_id IS NOT NULL AND public.has_club_write_access(club_id));

DROP POLICY IF EXISTS physical_test_types_update ON public.physical_test_types;
CREATE POLICY physical_test_types_update
  ON public.physical_test_types FOR UPDATE TO authenticated
  USING      (club_id IS NOT NULL AND public.has_club_write_access(club_id))
  WITH CHECK (club_id IS NOT NULL AND public.has_club_write_access(club_id));

DROP POLICY IF EXISTS physical_test_types_delete ON public.physical_test_types;
CREATE POLICY physical_test_types_delete
  ON public.physical_test_types FOR DELETE TO authenticated
  USING (club_id IS NOT NULL AND public.has_club_write_access(club_id));

-- --- Préférences de catalogue ----------------------------------------------
DROP POLICY IF EXISTS physical_test_type_prefs_select ON public.physical_test_type_prefs;
CREATE POLICY physical_test_type_prefs_select
  ON public.physical_test_type_prefs FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));

DROP POLICY IF EXISTS physical_test_type_prefs_write ON public.physical_test_type_prefs;
CREATE POLICY physical_test_type_prefs_write
  ON public.physical_test_type_prefs FOR ALL TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));

-- --- Campagnes --------------------------------------------------------------
-- Lecture réservée au staff en écriture : une campagne porte la liste de qui a
-- été testé, donc de la donnée de santé. Un joueur n'a pas besoin de la voir,
-- il accède à SES résultats par §Résultats.
DROP POLICY IF EXISTS physical_test_sessions_select ON public.physical_test_sessions;
CREATE POLICY physical_test_sessions_select
  ON public.physical_test_sessions FOR SELECT TO authenticated
  USING (public.has_club_write_access(club_id));

DROP POLICY IF EXISTS physical_test_sessions_write ON public.physical_test_sessions;
CREATE POLICY physical_test_sessions_write
  ON public.physical_test_sessions FOR ALL TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));

-- --- Résultats --------------------------------------------------------------
DROP POLICY IF EXISTS physical_test_results_select ON public.physical_test_results;
CREATE POLICY physical_test_results_select
  ON public.physical_test_results FOR SELECT TO authenticated
  USING (public.has_player_health_access(player_id));

DROP POLICY IF EXISTS physical_test_results_write ON public.physical_test_results;
CREATE POLICY physical_test_results_write
  ON public.physical_test_results FOR ALL TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- §7. Catalogue système
--
-- Choisi pour le futsal : sport intermittent sur surface dure, beaucoup de
-- changements d'appui, très peu de course longue. D'où le 30-15 IFT et le 505
-- plutôt qu'un test de VMA continu.
--
-- Idempotent : ON CONFLICT sur (club_id, code), l'unique étant en NULLS NOT
-- DISTINCT, deux tests système de même code ne peuvent pas coexister.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.physical_test_types
  (club_id, code, label, category, unit, direction, decimals, attempts, aggregation, sort_order, protocol_note)
VALUES
  (NULL, 'sprint_10m',   'Sprint 10 m',                  'vitesse',        's',    'lower_is_better',  2, 3, 'best',  10, 'Départ arrêté, 2 pieds derrière la ligne. Récupération complète entre les essais.'),
  (NULL, 'sprint_20m',   'Sprint 20 m',                  'vitesse',        's',    'lower_is_better',  2, 3, 'best',  20, 'Même départ que le 10 m. Peut se chronométrer sur la même course avec deux cellules.'),
  (NULL, 'agility_505',  'Test 505',                     'agilite',        's',    'lower_is_better',  2, 2, 'best',  30, 'Changement de direction à 180°. Deux essais par côté : noter le meilleur de chaque côté séparément si l''asymétrie vous intéresse.'),
  (NULL, 't_test',       'T-test',                       'agilite',        's',    'lower_is_better',  2, 2, 'best',  40, 'Déplacements avant, latéraux et arrière. Sensible à la technique de pas chassés.'),
  (NULL, 'cmj',          'Détente verticale (CMJ)',      'puissance',      'cm',   'higher_is_better', 1, 3, 'best',  50, 'Contre-mouvement libre, mains aux hanches pour limiter l''aide des bras.'),
  (NULL, 'squat_jump',   'Squat jump',                   'puissance',      'cm',   'higher_is_better', 1, 3, 'best',  60, 'Départ maintenu à 90°, sans contre-mouvement. Comparé au CMJ, il isole la part élastique.'),
  (NULL, 'triple_bond',  'Triple bond horizontal',       'puissance',      'm',    'higher_is_better', 2, 2, 'best',  70, 'Trois bonds enchaînés, départ arrêté. Mesure au talon le plus proche.'),
  (NULL, 'ift_30_15',    '30-15 IFT (VIFT)',             'endurance',      'km/h', 'higher_is_better', 1, 1, 'last',  80, 'Test intermittent 30 s / 15 s. Le plus adapté au futsal. La VIFT sert directement à calibrer les intermittents.'),
  (NULL, 'yoyo_ir1',     'Yo-Yo IR1',                    'endurance',      'm',    'higher_is_better', 0, 1, 'last',  90, 'Alternative au 30-15 si vous n''avez pas la bande sonore IFT. Noter la distance totale.'),
  (NULL, 'plank',        'Gainage face',                 'endurance',      's',    'higher_is_better', 0, 1, 'last', 100, 'Arrêt à la première perte d''alignement, pas à l''épuisement.'),
  (NULL, 'sit_reach',    'Souplesse (sit and reach)',    'mobilite',       'cm',   'higher_is_better', 1, 2, 'best', 110, 'Valeur négative possible : 0 = bout des doigts au niveau des orteils.'),
  (NULL, 'weight',       'Poids',                        'anthropometrie', 'kg',   'neutral',          1, 1, 'last', 120, 'Suivi de tendance uniquement. Aucune couleur de jugement, aucun classement.'),
  (NULL, 'height',       'Taille',                       'anthropometrie', 'cm',   'neutral',          0, 1, 'last', 130, 'Utile en catégories jeunes pour lire les pics de croissance.')
ON CONFLICT (club_id, code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- §8. Garde-fou permanent
-- ─────────────────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_missing text;
  v_open    text;
  v_anon    text;
  v_seeded  int;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_missing
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('physical_test_types','physical_test_type_prefs',
                       'physical_test_sessions','physical_test_results')
     AND NOT c.relrowsecurity;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS desactivee sur : %', v_missing;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_open
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename LIKE 'physical\_test\_%'
     AND permissive = 'PERMISSIVE'
     AND (
          coalesce(qual, '')       IN ('true', '(auth.role() = ''authenticated''::text)')
       OR coalesce(with_check, '') IN ('true', '(auth.role() = ''authenticated''::text)')
     );

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Policy sans condition d''appartenance : %', v_open;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_anon
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename LIKE 'physical\_test\_%'
     AND 'anon' = ANY (roles::text[]);

  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'anon joignable sur les tests physiques : %', v_anon;
  END IF;

  SELECT count(*) INTO v_seeded
    FROM public.physical_test_types WHERE club_id IS NULL;

  IF v_seeded < 13 THEN
    RAISE EXCEPTION 'Catalogue systeme incomplet : % tests sur 13 attendus.', v_seeded;
  END IF;

  RAISE NOTICE 'OK : 4 tables sous RLS, aucune policy ouverte, anon exclu, catalogue systeme a % tests.', v_seeded;
END
$mig$;

COMMIT;
