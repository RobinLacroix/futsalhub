-- Matchs : n'afficher que ceux sur lesquels le joueur a été convoqué par le manager (présent dans matches.players)

CREATE OR REPLACE FUNCTION get_my_upcoming_matches()
RETURNS TABLE (
  match_id UUID,
  match_date TIMESTAMPTZ,
  title TEXT,
  location TEXT,
  competition TEXT,
  opponent_team TEXT,
  team_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_ids UUID[];
  v_from_paris TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t.team_id), ARRAY[]::UUID[]) INTO v_team_ids
  FROM (
    SELECT pt.team_id FROM player_teams pt WHERE pt.player_id = v_player_id
    UNION
    SELECT p.team_id FROM players p WHERE p.id = v_player_id AND p.team_id IS NOT NULL
  ) AS t(team_id);

  IF array_length(v_team_ids, 1) IS NULL OR array_length(v_team_ids, 1) = 0 THEN
    RETURN;
  END IF;

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Paris');

  -- Matchs à venir de l'équipe ET où le joueur a été convoqué (présent dans m.players)
  RETURN QUERY
  SELECT
    m.id AS match_id,
    m.date AS match_date,
    m.title,
    m.location,
    m.competition,
    m.opponent_team,
    t.name AS team_name
  FROM matches m
  JOIN teams t ON t.id = m.team_id
  WHERE m.team_id = ANY(v_team_ids)
    AND m.date >= v_from_paris
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
      WHERE elem->>'id' = v_player_id::text
    )
  ORDER BY m.date ASC;
END;
$$;

COMMENT ON FUNCTION get_my_upcoming_matches() IS 'Matchs à venir sur lesquels le joueur a été convoqué par le manager (présent dans matches.players).';
