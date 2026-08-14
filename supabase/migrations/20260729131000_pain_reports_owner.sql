-- ─────────────────────────────────────────────────────────────────────────────
-- pain_reports : ouvrir la lecture au joueur propriétaire + suppression par le joueur
--   - get_player_pain_reports : staff (has_player_access) OU le joueur lui-même
--   - delete_my_pain_report   : le joueur supprime une de ses soumissions
-- ─────────────────────────────────────────────────────────────────────────────

-- Lecture : autoriser aussi le joueur propriétaire (fiche joueur mobile/web)
CREATE OR REPLACE FUNCTION get_player_pain_reports(p_player_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(g ORDER BY g.reported_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      pr.report_group,
      MIN(pr.reported_at)        AS reported_at,
      MAX(pr.source)             AS source,
      MAX(pr.intensity)          AS max_intensity,
      MAX(pr.note)               AS note,
      MAX(pr.onset)              AS onset,
      MAX(pr.training_id::text)  AS training_id,
      jsonb_agg(
        jsonb_build_object('zone', pr.zone, 'side', pr.side, 'intensity', pr.intensity, 'mode', pr.mode)
        ORDER BY pr.intensity DESC
      )                          AS zones
    FROM public.pain_reports pr
    WHERE pr.player_id = p_player_id
      AND (
        has_player_access(p_player_id)
        OR EXISTS (SELECT 1 FROM players p WHERE p.id = p_player_id AND p.user_id = auth.uid())
      )
    GROUP BY pr.report_group
  ) g;
$$;

GRANT EXECUTE ON FUNCTION get_player_pain_reports(UUID) TO authenticated;

-- Suppression par le joueur : efface une soumission entière (report_group) qui lui appartient
CREATE OR REPLACE FUNCTION delete_my_pain_report(p_report_group UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_n         INTEGER;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;

  DELETE FROM public.pain_reports
  WHERE report_group = p_report_group
    AND player_id = v_player_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'deleted', v_n);
END;
$$;

GRANT EXECUTE ON FUNCTION delete_my_pain_report(UUID) TO authenticated;
