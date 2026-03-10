-- 1. Corriger le filtre de date : "à partir d'aujourd'hui à 00:00 Paris" en timestamptz
--    (évite les soucis de timezone session vs Europe/Paris)
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

  -- Aujourd'hui 00:00:00 à Paris, en timestamptz
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
  JOIN player_teams pt ON pt.team_id = tr.team_id AND pt.player_id = v_player_id
  LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
    AND tft.player_id = v_player_id
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()
  WHERE tr.date >= v_from_paris
  ORDER BY tr.date ASC;
END;
$$;

-- 2. RPC de diagnostic : pourquoi la liste de convocations est vide (pour message dans l'app)
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

  SELECT COUNT(*)::int INTO v_team_count
  FROM player_teams
  WHERE player_id = v_player_id;

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date)::timestamp AT TIME ZONE 'Europe/Paris');

  SELECT COUNT(*)::int INTO v_upcoming_count
  FROM trainings tr
  JOIN player_teams pt ON pt.team_id = tr.team_id AND pt.player_id = v_player_id
  WHERE tr.date >= v_from_paris;

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

GRANT EXECUTE ON FUNCTION get_my_convocations_status() TO authenticated;

COMMENT ON FUNCTION get_my_convocations_status() IS 'Diagnostic pour l’app : pourquoi la liste de convocations est vide (has_player, team_count, upcoming_count, hint)';
