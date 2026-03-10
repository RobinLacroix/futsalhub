-- 1. Joueurs convoqués par séance : seuls eux voient la séance dans leur calendrier
ALTER TABLE trainings
  ADD COLUMN IF NOT EXISTS convoked_players JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN trainings.convoked_players IS 'Joueurs convoqués pour cette séance ([{"id":"uuid"},...]). Si vide/null historique = toute l''équipe voit la séance.';

-- 2. get_my_calendar_events : n''afficher les entraînements que si le joueur est convoqué (ou si convoked_players vide = rétrocompat)
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

  -- Entraînements : équipe ET (convoked_players vide = tous, sinon joueur doit être dans convoked_players)
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
      AND (
        tr.convoked_players IS NULL
        OR tr.convoked_players = '[]'::jsonb
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(tr.convoked_players) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

  -- Matchs à venir où le joueur est convoqué
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

-- 3. Le joueur ne peut répondre à la convocation que jusqu''à 2h avant la séance
CREATE OR REPLACE FUNCTION set_my_training_attendance(p_training_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_id UUID;
  v_in_team BOOLEAN;
  v_attendance JSONB;
  v_training_date TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('present', 'absent', 'late') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_player');
  END IF;

  SELECT tr.team_id, tr.date INTO v_team_id, v_training_date
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  -- Délai : 2h avant la séance (heure Paris)
  v_deadline := v_training_date - INTERVAL '2 hours';
  IF NOW() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM player_teams pt
    WHERE pt.player_id = v_player_id AND pt.team_id = v_team_id
  ) INTO v_in_team;
  IF NOT v_in_team THEN
    SELECT (SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = v_team_id INTO v_in_team;
  END IF;
  IF NOT v_in_team THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_team');
  END IF;

  SELECT COALESCE(tr.attendance, '{}'::jsonb) INTO v_attendance
  FROM trainings tr
  WHERE tr.id = p_training_id;

  v_attendance := jsonb_set(v_attendance, ARRAY[v_player_id::text], to_jsonb(p_status::text), true);

  UPDATE trainings
  SET attendance = v_attendance
  WHERE id = p_training_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. RPC : le coach envoie les questionnaires (crée les tokens pour présents + retard)
CREATE OR REPLACE FUNCTION create_feedback_tokens_for_training(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_team_id UUID;
  v_inserted INT := 0;
  v_player_id TEXT;
  v_status TEXT;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT tr.id, tr.team_id INTO v_training_id, v_team_id
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_training_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  IF NOT has_club_access((SELECT club_id FROM teams WHERE id = v_team_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_expires := NOW() + INTERVAL '7 days';

  FOR v_player_id, v_status IN
    SELECT key, value
    FROM jsonb_each_text((
      SELECT COALESCE(attendance, '{}'::jsonb) FROM trainings WHERE id = p_training_id
    ))
  LOOP
    IF v_status IN ('present', 'late') THEN
      v_token := gen_random_uuid()::text;
      INSERT INTO training_feedback_tokens (training_id, player_id, token, expires_at)
      VALUES (p_training_id, v_player_id::uuid, v_token, v_expires)
      ON CONFLICT (training_id, player_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used_at = NULL;
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION create_feedback_tokens_for_training(UUID) TO authenticated;

COMMENT ON FUNCTION create_feedback_tokens_for_training(UUID) IS 'Crée les tokens questionnaire pour les joueurs présents/retard (à appeler en fin de séance par le coach).';
