-- ═════════════════════════════════════════════════════════════════════════════
-- Matrice individuelle de charge — bornage à la saison choisie
--
-- `get_team_training_load_matrix` (20260814140000) prenait « les p_limit
-- dernières séances », sans borne de dates : au changement de saison dans le
-- sélecteur (mobile ET web, `activeSeason`), la matrice continuait de montrer
-- les dernières séances réelles, potentiellement encore celles de la saison
-- précédente. Même défaut que celui corrigé côté `get_training_load` /
-- `get_player_training_load` pour la charge et le wellness — cette fonction-ci
-- n'avait pas encore reçu le même traitement.
--
-- `p_from`/`p_to` bornent maintenant `last_sessions` EN PLUS du LIMIT : en
-- tout début de saison, la matrice affichera donc moins de `p_limit` colonnes
-- (3 ou 4 séances) plutôt que de compléter avec des séances d'une autre
-- saison. C'est le comportement demandé, pas un effet de bord à corriger.
--
-- `CREATE OR REPLACE` ne suffit pas ici : ajouter des paramètres change la
-- liste de types de la fonction, donc Postgres la traiterait comme une
-- surcharge distincte et laisserait l'ancienne (3 arguments) callable à côté
-- — même piège que documenté dans 20260814130000. DROP explicite de l'ancienne
-- signature d'abord.
-- ═════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_team_training_load_matrix(uuid, uuid, integer);

CREATE FUNCTION public.get_team_training_load_matrix(
  p_club_id uuid,
  p_team_id uuid,
  p_limit   integer DEFAULT 5,
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL
)
RETURNS TABLE (
  training_id      uuid,
  session_date     date,
  theme            text,
  session_duration integer,
  target_rpe_min   smallint,
  target_rpe_max   smallint,
  player_id        uuid,
  first_name       text,
  last_name        text,
  number           integer,
  convoked         boolean,
  rpe              smallint,
  physical_form    smallint,
  pleasure         smallint,
  auto_evaluation  smallint
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
  WITH last_sessions AS (
    SELECT
      t.id,
      (t.date AT TIME ZONE 'Europe/Paris')::date AS session_date,
      t.theme,
      t.session_duration,
      t.target_rpe_min,
      t.target_rpe_max,
      t.attendance,
      t.convoked_players
    FROM public.trainings t
    LEFT JOIN public.teams tm ON tm.id = t.team_id
    WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
      AND t.team_id = p_team_id
      AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
    ORDER BY t.date DESC
    LIMIT GREATEST(p_limit, 0)
  ),
  roster AS (
    SELECT p.id AS player_id, p.first_name, p.last_name, p.number
    FROM public.players p
    WHERE p.team_id = p_team_id
  )
  SELECT
    s.id,
    s.session_date,
    s.theme,
    s.session_duration,
    s.target_rpe_min,
    s.target_rpe_max,
    r.player_id,
    r.first_name,
    r.last_name,
    r.number,
    (
      (s.attendance ? r.player_id::text)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(s.convoked_players, '[]'::jsonb)) e
        WHERE e->>'id' = r.player_id::text
      )
    ) AS convoked,
    f.rpe,
    f.physical_form,
    f.pleasure,
    f.auto_evaluation
  FROM last_sessions s
  CROSS JOIN roster r
  LEFT JOIN public.training_player_feedback f
    ON f.training_id = s.id AND f.player_id = r.player_id
  ORDER BY s.session_date, r.last_name, r.first_name;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer, date, date) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 5;

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_team_training_load_matrix (5 arguments) absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 5)
     NOT LIKE '%has_club_medical_access%' THEN
    RAISE EXCEPTION 'get_team_training_load_matrix n''utilise pas la garde de donnees de sante';
  END IF;

  -- L'ancienne surcharge à 3 arguments doit avoir disparu : sinon elle reste
  -- callable via /rest/v1/rpc et ignore silencieusement le bornage de saison.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'ancienne surcharge (3 arguments) de get_team_training_load_matrix toujours presente';
  END IF;

  RAISE NOTICE 'get_team_training_load_matrix (bornage saison) verifiee.';
END
$mig$;
