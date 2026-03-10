-- Diagnostic + assouplir la date : afficher les séances à partir d'hier (Paris)
-- pour éviter les soucis de fuseau et montrer les séances récentes

-- 1. get_my_convocations : à partir d'hier 00:00 Paris (au lieu d'aujourd'hui)
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

  -- À partir d'hier 00:00 Paris (pour inclure séances d'hier + aujourd'hui + futur)
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

-- 2. get_my_upcoming_matches : idem (à partir d'hier Paris)
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

-- 3. RPC de diagnostic : à appeler depuis l'app ou le SQL Editor (en étant connecté avec le compte joueur)
-- Retourne pourquoi les convocations sont vides (pour débug).
CREATE OR REPLACE FUNCTION get_my_convocations_debug()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_player_team_id UUID;
  v_team_ids UUID[];
  v_trainings_upcoming INT;
  v_trainings_total INT;
  v_from_paris TIMESTAMPTZ;
BEGIN
  SELECT id, team_id INTO v_player_id, v_player_team_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_player',
      'message', 'Aucun joueur lié à ce compte (players.user_id). Liez le compte depuis la fiche joueur.'
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT team_id), ARRAY[]::UUID[]) INTO v_team_ids
  FROM (
    SELECT pt.team_id FROM player_teams pt WHERE pt.player_id = v_player_id
    UNION
    SELECT p.team_id FROM players p WHERE p.id = v_player_id AND p.team_id IS NOT NULL
  ) AS t(team_id);

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Paris');

  SELECT COUNT(*)::int INTO v_trainings_upcoming
  FROM trainings tr
  WHERE tr.date >= v_from_paris
    AND (tr.team_id = ANY(v_team_ids));

  SELECT COUNT(*)::int INTO v_trainings_total
  FROM trainings tr
  WHERE tr.team_id = ANY(v_team_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'player_id', v_player_id,
    'player_team_id', v_player_team_id,
    'team_ids', v_team_ids,
    'team_count', COALESCE(array_length(v_team_ids, 1), 0),
    'trainings_upcoming', v_trainings_upcoming,
    'trainings_total_for_teams', v_trainings_total,
    'from_date_paris', v_from_paris
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_convocations_debug() TO authenticated;

COMMENT ON FUNCTION get_my_convocations_debug() IS 'Diagnostic : joueur, équipes, nombre d''entraînements (à venir / total). Appeler en étant connecté avec le compte joueur.';
