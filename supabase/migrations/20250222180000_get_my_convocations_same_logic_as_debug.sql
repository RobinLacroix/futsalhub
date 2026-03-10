-- Aligner get_my_convocations et get_my_upcoming_matches sur la même logique que get_my_convocations_debug
-- (liste d'équipes v_team_ids puis filtre tr.team_id = ANY(v_team_ids)) pour garantir le même résultat.

CREATE OR REPLACE FUNCTION get_my_convocations()
RETURNS TABLE (
  training_id UUID,
  training_date TIMESTAMPTZ,
  location TEXT,
  theme TEXT,
  team_name TEXT,
  my_status TEXT,
  feedback_token TEXT,
  feedback_url TEXT
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

  -- Même liste d'équipes que get_my_convocations_debug
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

  RETURN QUERY
  SELECT
    tr.id AS training_id,
    tr.date AS training_date,
    tr.location,
    tr.theme,
    t.name AS team_name,
    (tr.attendance->>v_player_id::text)::text AS my_status,
    tft.token AS feedback_token,
    (CASE WHEN tft.token IS NOT NULL THEN ('/feedback/session/' || tft.token)::text ELSE NULL END) AS feedback_url
  FROM trainings tr
  JOIN teams t ON t.id = tr.team_id
  LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
    AND tft.player_id = v_player_id
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()
  WHERE tr.team_id = ANY(v_team_ids)
    AND tr.date >= v_from_paris
  ORDER BY tr.date ASC;
END;
$$;

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
  ORDER BY m.date ASC;
END;
$$;

COMMENT ON FUNCTION get_my_convocations() IS 'Convocations : même logique que get_my_convocations_debug (v_team_ids puis team_id = ANY).';
