-- ═════════════════════════════════════════════════════════════════════════════
-- Matrice individuelle de charge — joueurs × 5 dernières séances
--
-- `get_training_load` renvoie une ligne PAR SÉANCE (moyenne d'équipe).
-- `get_player_training_load` renvoie une ligne PAR SÉANCE pour UN joueur choisi
-- à l'avance. Aucune des deux ne permet « tous les joueurs, sur les mêmes
-- séances, en un seul aller-retour » — c'est ce que la vue matrice demande :
-- une case par (joueur, séance), pour repérer en un coup d'oeil qui a ressenti
-- un effort plus fort, un plaisir moindre, etc.
--
-- Forme du résultat : une ligne par (séance, joueur) de l'effectif ACTUEL de
-- l'équipe, sur les `p_limit` séances les plus récentes. `convoked` distingue
-- explicitement « non convoqué / repos » (case grisée côté écran) de
-- « convoqué mais questionnaire non répondu » (rpe etc. NULL) : les deux ne
-- doivent pas être confondus, ce sont deux réalités différentes pour le staff.
--
-- Garde : has_club_medical_access, comme get_training_load — RPE et wellness
-- sont des données de santé, `viewer` reste dehors.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_team_training_load_matrix(
  p_club_id uuid,
  p_team_id uuid,
  p_limit   integer DEFAULT 5
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

REVOKE ALL ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_team_training_load_matrix absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix')
     NOT LIKE '%has_club_medical_access%' THEN
    RAISE EXCEPTION 'get_team_training_load_matrix n''utilise pas la garde de donnees de sante';
  END IF;

  RAISE NOTICE 'get_team_training_load_matrix verifiee.';
END
$mig$;
