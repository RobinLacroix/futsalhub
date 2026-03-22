-- RPC unique pour charger équipes + entraînements + matchs en un seul round-trip.
-- Réduit la latence perçue du calendrier (1 appel au lieu de 3).
CREATE OR REPLACE FUNCTION get_coach_calendar_data(p_team_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_teams JSONB;
  v_trainings JSONB;
  v_matches JSONB;
BEGIN
  v_club_id := get_user_club_id();
  IF v_club_id IS NULL THEN
    RETURN jsonb_build_object('teams', '[]'::jsonb, 'trainings', '[]'::jsonb, 'matches', '[]'::jsonb);
  END IF;

  -- Équipes du club (id, name, category, level, color, club_id)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'level', t.level, 'color', t.color, 'club_id', t.club_id)
    ORDER BY t.name
  ), '[]'::jsonb) INTO v_teams
  FROM teams t
  WHERE t.club_id = v_club_id;

  -- Si p_team_id fourni et valide : charger entraînements et matchs.
  -- Si p_team_id NULL : utiliser la première équipe du club (pour premier chargement).
  IF p_team_id IS NULL AND v_teams IS NOT NULL AND jsonb_array_length(v_teams) > 0 THEN
    p_team_id := (v_teams->0->>'id')::UUID;
  END IF;

  IF p_team_id IS NOT NULL AND has_team_access(p_team_id) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.date DESC NULLS LAST), '[]'::jsonb) INTO v_trainings
    FROM (
      SELECT id, date, theme, COALESCE(location, '') AS location, team_id
      FROM trainings
      WHERE team_id = p_team_id
      ORDER BY date DESC
      LIMIT 200
    ) tr;

    SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.date DESC NULLS LAST), '[]'::jsonb) INTO v_matches
    FROM (
      SELECT id, date, title, COALESCE(location, '') AS location, COALESCE(competition, '') AS competition,
        score_team, score_opponent, team_id
      FROM matches
      WHERE team_id = p_team_id
      ORDER BY date DESC
      LIMIT 200
    ) m;
  ELSE
    v_trainings := '[]'::jsonb;
    v_matches := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'teams', COALESCE(v_teams, '[]'::jsonb),
    'trainings', COALESCE(v_trainings, '[]'::jsonb),
    'matches', COALESCE(v_matches, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_coach_calendar_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_coach_calendar_data(UUID) TO anon;

COMMENT ON FUNCTION get_coach_calendar_data(UUID) IS 'Retourne { teams, trainings, matches } en un appel. Entraînements et matchs allégés (sans JSONB lourd).';
