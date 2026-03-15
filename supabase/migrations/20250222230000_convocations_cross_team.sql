-- Convocations cross-équipe : un joueur convoqué par une autre équipe (entraînement ou match)
-- doit voir la convocation dans son calendrier (webapp + mobile) et voir clairement l'équipe concernée.

-- 1. get_my_calendar_events : inclure entraînements où le joueur est dans convoked_players
--    et matchs où le joueur est dans players, même si ce n'est pas son équipe.
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

  -- Ne plus retourner vide si le joueur n'a aucune équipe : il peut être convoqué ailleurs
  v_from_paris := (((NOW() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Paris');

  -- Entraînements : (équipe du joueur ET convocation) OU convoqué par une autre équipe (dans convoked_players)
  -- is_other_team = true quand convoqué par une équipe autre que les siennes (pour affichage couleur)
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.training_date), '[]'::jsonb) INTO v_trainings
  FROM (
    SELECT
      tr.id AS training_id,
      tr.date AS training_date,
      tr.location,
      t.name AS team_name,
      (tr.attendance->>v_player_id::text)::text AS my_status,
      tft.token AS feedback_token,
      (CASE WHEN tft.token IS NOT NULL THEN ('/feedback/session/' || tft.token)::text ELSE NULL END) AS feedback_url,
      (tr.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team
    FROM trainings tr
    JOIN teams t ON t.id = tr.team_id
    LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
      AND tft.player_id = v_player_id
      AND tft.used_at IS NULL
      AND tft.expires_at > NOW()
    WHERE tr.date >= v_from_paris
      AND (
        -- Cas 1 : séance d'une de ses équipes ET (convoked_players vide ou il est convoqué)
        (
          tr.team_id = ANY(v_team_ids)
          AND (
            tr.convoked_players IS NULL
            OR tr.convoked_players = '[]'::jsonb
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(tr.convoked_players) AS elem
              WHERE elem->>'id' = v_player_id::text
            )
          )
        )
        -- Cas 2 : convoqué par une autre équipe (présent dans convoked_players)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

  -- Matchs : inclure tous les matchs où le joueur est dans la liste players (son équipe ou invité)
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.match_date), '[]'::jsonb) INTO v_matches
  FROM (
    SELECT
      m.id AS match_id,
      m.date AS match_date,
      m.title,
      m.location,
      m.competition,
      m.opponent_team,
      t.name AS team_name,
      (m.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team
    FROM matches m
    JOIN teams t ON t.id = m.team_id
    WHERE m.date >= v_from_paris
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
        WHERE elem->>'id' = v_player_id::text
      )
  ) row;

  RETURN jsonb_build_object('trainings', COALESCE(v_trainings, '[]'::jsonb), 'matches', COALESCE(v_matches, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION get_my_calendar_events() IS 'Calendrier joueur : entraînements et matchs où il est convoqué (son équipe ou invité par une autre équipe). team_name = équipe qui convoque.';

-- 2. get_my_convocations : inclure les entraînements où le joueur est dans convoked_players (même autre équipe)
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
      -- Son équipe (player_teams ou players.team_id)
      EXISTS (SELECT 1 FROM player_teams pt WHERE pt.team_id = tr.team_id AND pt.player_id = v_player_id)
      OR ((SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = tr.team_id)
      -- Ou convoqué par une autre équipe
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(tr.convoked_players, '[]'::jsonb)) AS elem
        WHERE elem->>'id' = v_player_id::text
      )
    )
  ORDER BY tr.date ASC;
END;
$$;

-- 3. get_my_upcoming_matches : inclure les matchs où le joueur est dans players (même autre équipe)
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
      -- Son équipe
      EXISTS (SELECT 1 FROM player_teams pt WHERE pt.team_id = m.team_id AND pt.player_id = v_player_id)
      OR ((SELECT p.team_id FROM players p WHERE p.id = v_player_id LIMIT 1) = m.team_id)
      -- Ou convoqué (présent dans players du match)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
        WHERE elem->>'id' = v_player_id::text
      )
    )
  ORDER BY m.date ASC;
END;
$$;

-- 4. set_my_training_attendance : autoriser aussi si le joueur est convoqué (invité autre équipe)
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
  v_convoqued BOOLEAN;
  v_attendance JSONB;
  v_training_date TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('present', 'absent', 'late', 'injured') THEN
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
  -- Autoriser aussi si convoqué par une autre équipe (invité)
  IF NOT v_in_team THEN
    SELECT EXISTS (
      SELECT 1 FROM trainings tr2
      WHERE tr2.id = p_training_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr2.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
    ) INTO v_convoqued;
    IF NOT v_convoqued THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_in_team');
    END IF;
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
