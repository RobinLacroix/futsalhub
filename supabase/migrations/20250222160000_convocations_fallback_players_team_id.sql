-- Fallback: si le joueur n'a aucune ligne dans player_teams, utiliser players.team_id
-- pour que les convocations s'affichent quand même (données anciennes ou équipe principale seule)

-- 1. get_my_convocations : équipes = player_teams OU players.team_id
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
  WHERE tr.date >= v_from_paris
    AND (
      EXISTS (
        SELECT 1 FROM player_teams pt
        WHERE pt.team_id = tr.team_id AND pt.player_id = v_player_id
      )
      OR (
        (SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = tr.team_id
      )
    )
  ORDER BY tr.date ASC;
END;
$$;

-- 2. get_my_upcoming_matches : idem
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
  WHERE m.date >= v_from_paris
    AND (
      EXISTS (
        SELECT 1 FROM player_teams pt
        WHERE pt.team_id = m.team_id AND pt.player_id = v_player_id
      )
      OR (
        (SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = m.team_id
      )
    )
  ORDER BY m.date ASC;
END;
$$;

-- 3. get_my_convocations_status : compter les entraînements à venir avec le même critère d'équipe
CREATE OR REPLACE FUNCTION get_my_convocations_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_count INT;
  v_upcoming_count INT;
  v_from_paris TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_player', false,
      'team_count', 0,
      'upcoming_count', 0,
      'hint', 'no_player'
    );
  END IF;

  -- Nombre d'équipes : player_teams + 1 si players.team_id renseigné et pas déjà dans player_teams
  SELECT COUNT(DISTINCT team_id)::int INTO v_team_count
  FROM (
    SELECT pt.team_id FROM player_teams pt WHERE pt.player_id = v_player_id
    UNION
    SELECT p.team_id FROM players p WHERE p.id = v_player_id AND p.team_id IS NOT NULL
  ) AS teams;

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date)::timestamp AT TIME ZONE 'Europe/Paris');

  SELECT COUNT(*)::int INTO v_upcoming_count
  FROM trainings tr
  WHERE tr.date >= v_from_paris
    AND (
      EXISTS (
        SELECT 1 FROM player_teams pt
        WHERE pt.team_id = tr.team_id AND pt.player_id = v_player_id
      )
      OR (
        (SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = tr.team_id
      )
    );

  RETURN jsonb_build_object(
    'has_player', true,
    'team_count', v_team_count,
    'upcoming_count', v_upcoming_count,
    'hint', CASE
      WHEN v_team_count = 0 THEN 'no_team'
      WHEN v_upcoming_count = 0 THEN 'no_upcoming'
      ELSE 'ok'
    END
  );
END;
$$;

COMMENT ON FUNCTION get_my_convocations() IS 'Convocations (entraînements à venir). Équipes = player_teams ou players.team_id si pas de player_teams.';
COMMENT ON FUNCTION get_my_upcoming_matches() IS 'Matchs à venir. Équipes = player_teams ou players.team_id si pas de player_teams.';
