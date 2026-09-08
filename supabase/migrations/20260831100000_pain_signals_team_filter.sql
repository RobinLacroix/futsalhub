-- Signaux précoces : filtre par équipe manquant.
--
-- `get_pain_signals` n'acceptait qu'un `p_club_id` : la page Performance
-- (web et mobile) affichait donc les signaux de tout le club, y compris pour
-- un coach n'ayant qu'une équipe active sélectionnée, alors que les deux
-- fonctions sœurs `get_club_availability` et `get_club_pain_reports`
-- filtrent déjà par `p_team_id` optionnel. On ajoute le même paramètre ici,
-- avec le même repli `NULL => tout le club`.
--
-- La signature change (nouveau paramètre), donc `CREATE OR REPLACE` créerait
-- une surcharge au lieu de remplacer l'ancienne fonction : on la supprime
-- explicitement d'abord.
DROP FUNCTION IF EXISTS public.get_pain_signals(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_pain_signals(
  p_club_id      uuid,
  p_window_days  integer DEFAULT 21,
  p_min_reports  integer DEFAULT 3,
  p_team_id      uuid DEFAULT NULL
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
    AND (p_team_id IS NULL OR p.team_id = p_team_id)
    AND r.reported_at >= now() - make_interval(days => p_window_days)
  GROUP BY p.id, p.first_name, p.last_name, r.zone, r.side
  HAVING COUNT(*) >= p_min_reports
  ORDER BY COUNT(*) DESC, MAX(r.reported_at) DESC;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_pain_signals(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pain_signals(uuid, integer, integer, uuid) TO authenticated;

-- Garde-fou : l'ancienne surcharge à 3 arguments ne doit plus exister, et la
-- nouvelle ne doit pas être exécutable par PUBLIC/anon (même idiome que le
-- §15 de 20260803100000).
DO $mig$
DECLARE
  v_old_count int;
  v_bad_grant boolean;
BEGIN
  SELECT COUNT(*) INTO v_old_count
  FROM pg_proc
  WHERE proname = 'get_pain_signals'
    AND pronamespace = 'public'::regnamespace
    AND pronargs = 3;

  IF v_old_count > 0 THEN
    RAISE EXCEPTION 'get_pain_signals(uuid,integer,integer) existe encore (% occurrence(s))', v_old_count;
  END IF;

  SELECT
    p.proacl IS NULL
    OR EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) a
      LEFT JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR gr.rolname = 'anon')
    )
  INTO v_bad_grant
  FROM pg_proc p
  WHERE p.proname = 'get_pain_signals'
    AND p.pronamespace = 'public'::regnamespace
    AND p.pronargs = 4;

  IF v_bad_grant THEN
    RAISE EXCEPTION 'get_pain_signals reste exposee a PUBLIC/anon';
  END IF;
END
$mig$;
