-- Une seule RPC qui retourne tout en JSONB : entraînements + matchs (convoqués)
-- Évite les soucis de format TABLE / array côté client et garantit la même logique que le diagnostic.

CREATE OR REPLACE FUNCTION get_my_calendar_events()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_ids UUID[];
  v_from_paris TIMESTAMPTZ;
  v_trainings JSONB;
  v_matches JSONB;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('trainings', '[]'::jsonb, 'matches', '[]'::jsonb);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t.team_id), ARRAY[]::UUID[]) INTO v_team_ids
  FROM (
    SELECT pt.team_id FROM player_teams pt WHERE pt.player_id = v_player_id
    UNION
    SELECT p.team_id FROM players p WHERE p.id = v_player_id AND p.team_id IS NOT NULL
  ) AS t(team_id);

  IF array_length(v_team_ids, 1) IS NULL OR array_length(v_team_ids, 1) = 0 THEN
    RETURN jsonb_build_object('trainings', '[]'::jsonb, 'matches', '[]'::jsonb);
  END IF;

  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Paris');

  -- Entraînements à venir de l'équipe
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.training_date), '[]'::jsonb) INTO v_trainings
  FROM (
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
  ) row;

  -- Matchs à venir où le joueur est convoqué (présent dans matches.players)
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.match_date), '[]'::jsonb) INTO v_matches
  FROM (
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
  ) row;

  RETURN jsonb_build_object('trainings', COALESCE(v_trainings, '[]'::jsonb), 'matches', COALESCE(v_matches, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_calendar_events() TO authenticated;

COMMENT ON FUNCTION get_my_calendar_events() IS 'Retourne { trainings: [...], matches: [...] } pour le joueur connecté (même logique que le diagnostic).';
