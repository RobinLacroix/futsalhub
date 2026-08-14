-- ═════════════════════════════════════════════════════════════════════════════
-- Charge d'entraînement individuelle + RPE cible dans get_training_load.
--
-- Deux ajouts, une seule migration car ils se lisent ensemble :
--
-- 1. get_training_load (20260813160000) renvoie déjà une ligne PAR SÉANCE
--    (team_id, theme, session_duration, rpe_mean...) ; il ne renvoyait pas
--    target_rpe_min/max (20260814120000, postérieure). Sans ça, aucune surface
--    ne peut comparer prévu et réalisé.
--
-- 2. get_player_training_load est le jumeau individuel : même forme de ligne
--    par séance, mais UNE VALEUR (le RPE de CE joueur) au lieu d'une moyenne
--    d'équipe. C'est ce qui permet à `lib/trainingLoad.ts` (buildWeeklyLoads,
--    monotonie, pic) de tourner à l'identique sur les deux — même moteur de
--    calcul, deux sources de données. Convention : `convoked_count = response_count
--    = 1` sur chaque ligne, puisqu'une ligne EST une réponse ; pas de notion de
--    couverture à l'échelle d'un seul joueur, contrairement à l'équipe.
--
-- Garde : santé du joueur, donc has_player_health_access (staff medical/coach/
-- admin OU le joueur lui-même), pas has_club_medical_access qui ne connaît que
-- le club.
-- ═════════════════════════════════════════════════════════════════════════════

-- `CREATE OR REPLACE` ne peut pas changer la forme de la table retournue par
-- une fonction (ici : deux colonnes ajoutées au milieu) — Postgres exige un
-- DROP explicite. Idempotent : `IF EXISTS` tolère un rejeu après un premier
-- essai qui aurait échoué avant ce DROP.
DROP FUNCTION IF EXISTS public.get_training_load(uuid, uuid, date, date);

CREATE FUNCTION public.get_training_load(
  p_club_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL
)
RETURNS TABLE (
  training_id         uuid,
  session_date        date,
  team_id             uuid,
  theme               text,
  session_duration    integer,
  target_rpe_min      smallint,
  target_rpe_max      smallint,
  convoked_count      integer,
  response_count      integer,
  rpe_mean            numeric,
  auto_evaluation_mean numeric,
  physical_form_mean  numeric,
  pleasure_mean       numeric
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
    t.id,
    (t.date AT TIME ZONE 'Europe/Paris')::date,
    t.team_id,
    t.theme,
    t.session_duration,
    t.target_rpe_min,
    t.target_rpe_max,
    GREATEST(
      COALESCE(jsonb_array_length(NULLIF(t.convoked_players, 'null'::jsonb)), 0),
      COALESCE((SELECT COUNT(*)::int FROM jsonb_object_keys(COALESCE(t.attendance, '{}'::jsonb))), 0)
    ),
    COUNT(f.id)::integer,
    ROUND(AVG(f.rpe)::numeric, 2),
    ROUND(AVG(f.auto_evaluation)::numeric, 2),
    ROUND(AVG(f.physical_form)::numeric, 2),
    ROUND(AVG(f.pleasure)::numeric, 2)
  FROM public.trainings t
  LEFT JOIN public.teams tm ON tm.id = t.team_id
  LEFT JOIN public.training_player_feedback f ON f.training_id = t.id
  WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
    AND (p_team_id IS NULL OR t.team_id = p_team_id)
    AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
    AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
  GROUP BY t.id, t.date, t.team_id, t.theme, t.session_duration,
           t.target_rpe_min, t.target_rpe_max, t.convoked_players, t.attendance
  ORDER BY t.date;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_training_load(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_load(uuid, uuid, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_player_training_load(
  p_player_id uuid,
  p_from      date DEFAULT NULL,
  p_to        date DEFAULT NULL
)
RETURNS TABLE (
  training_id         uuid,
  session_date        date,
  team_id             uuid,
  theme                text,
  session_duration    integer,
  target_rpe_min      smallint,
  target_rpe_max      smallint,
  convoked_count      integer,
  response_count      integer,
  rpe_mean            numeric,
  auto_evaluation_mean numeric,
  physical_form_mean  numeric,
  pleasure_mean       numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_player_health_access(p_player_id) THEN
    RAISE EXCEPTION 'Acces refuse au joueur %', p_player_id;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    (t.date AT TIME ZONE 'Europe/Paris')::date,
    t.team_id,
    t.theme,
    t.session_duration,
    t.target_rpe_min,
    t.target_rpe_max,
    1,
    1,
    f.rpe::numeric,
    f.auto_evaluation::numeric,
    f.physical_form::numeric,
    f.pleasure::numeric
  FROM public.training_player_feedback f
  JOIN public.trainings t ON t.id = f.training_id
  WHERE f.player_id = p_player_id
    AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
    AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
  ORDER BY t.date;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_player_training_load(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_training_load(uuid, date, date) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_player_training_load';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_player_training_load absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_player_training_load')
     NOT LIKE '%has_player_health_access%' THEN
    RAISE EXCEPTION 'get_player_training_load n''utilise pas la garde de sante du joueur';
  END IF;

  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_training_load';

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_training_load')
     NOT LIKE '%target_rpe_min%' THEN
    RAISE EXCEPTION 'get_training_load ne renvoie pas target_rpe_min apres migration';
  END IF;

  RAISE NOTICE 'get_training_load et get_player_training_load verifiees.';
END
$mig$;
