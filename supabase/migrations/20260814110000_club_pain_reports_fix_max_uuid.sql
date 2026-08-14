-- ═════════════════════════════════════════════════════════════════════════════
-- Corrige get_club_pain_reports (20260814100000) : MAX(uuid) n'existe pas en
-- PostgreSQL — la fonction levait `function max(uuid) does not exist` à CHAQUE
-- appel, avalée côté client par le catch de getClubPainReports (web comme
-- mobile), qui affichait donc silencieusement « aucune déclaration » au lieu
-- de l'erreur réelle.
--
-- get_player_pain_reports (20260729120000) contournait déjà ça en castant
-- `pr.training_id::text` avant l'agrégat — repris ici à l'identique, avec un
-- cast retour en uuid pour ne pas changer le type de colonne RETURNS TABLE.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_club_pain_reports(
  p_club_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_limit   integer DEFAULT 30
)
RETURNS TABLE (
  report_group  uuid,
  player_id     uuid,
  first_name    text,
  last_name     text,
  number        integer,
  reported_at   timestamptz,
  source        text,
  max_intensity smallint,
  note          text,
  onset         text,
  training_id   uuid,
  zones         jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'Limite invalide : %', p_limit;
  END IF;

  RETURN QUERY
  SELECT g.report_group, g.player_id, g.first_name, g.last_name, g.number,
         g.reported_at, g.source, g.max_intensity, g.note, g.onset,
         g.training_id, g.zones
  FROM (
    SELECT
      pr.report_group,
      p.id                            AS player_id,
      p.first_name,
      p.last_name,
      p.number,
      MIN(pr.reported_at)             AS reported_at,
      MAX(pr.source)                  AS source,
      MAX(pr.intensity)               AS max_intensity,
      MAX(pr.note)                    AS note,
      MAX(pr.onset)                   AS onset,
      MAX(pr.training_id::text)::uuid AS training_id,
      jsonb_agg(
        jsonb_build_object('zone', pr.zone, 'side', pr.side, 'intensity', pr.intensity, 'mode', pr.mode)
        ORDER BY pr.intensity DESC
      )                               AS zones
    FROM public.pain_reports pr
    JOIN public.players p ON p.id = pr.player_id
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE COALESCE(p.club_id, t.club_id) = p_club_id
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
    GROUP BY pr.report_group, p.id, p.first_name, p.last_name, p.number
  ) g
  ORDER BY g.reported_at DESC
  LIMIT p_limit;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_club_pain_reports(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_pain_reports(uuid, uuid, integer) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_club_pain_reports';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_club_pain_reports absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_club_pain_reports')
     LIKE '%MAX(pr.training_id)%' THEN
    RAISE EXCEPTION 'get_club_pain_reports contient encore le MAX(uuid) casse';
  END IF;

  RAISE NOTICE 'get_club_pain_reports verifiee.';
END
$mig$;
