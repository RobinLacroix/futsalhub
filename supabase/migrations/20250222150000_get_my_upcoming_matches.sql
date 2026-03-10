-- Matchs à venir pour le joueur connecté (équipes dont il fait partie)
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
  v_from_paris TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN;
  END IF;

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date)::timestamp AT TIME ZONE 'Europe/Paris');

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
  JOIN player_teams pt ON pt.team_id = m.team_id AND pt.player_id = v_player_id
  WHERE m.date >= v_from_paris
  ORDER BY m.date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_upcoming_matches() TO authenticated;

COMMENT ON FUNCTION get_my_upcoming_matches() IS 'Matchs à venir pour le joueur connecté (équipes du joueur)';
