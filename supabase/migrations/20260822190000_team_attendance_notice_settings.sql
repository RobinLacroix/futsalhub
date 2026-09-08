-- Délai de prévenance (absence / retard) réglable par équipe, demandé par Robin.
-- Jusqu'ici en dur dans set_my_training_attendance (6h / 15 min, 20260822170000).
--
-- Stocké en minutes pour les deux (plutôt qu'heures pour l'un, minutes pour l'autre) :
-- une seule unité, n'importe quelle valeur reste exprimable (30 min, 10h = 600 min, ...).
-- Valeurs par défaut = les anciennes constantes en dur, comportement inchangé pour toutes
-- les équipes existantes tant que le coach ne les modifie pas.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS absence_notice_minutes INT NOT NULL DEFAULT 360
    CHECK (absence_notice_minutes >= 0 AND absence_notice_minutes <= 20160), -- max 14 jours
  ADD COLUMN IF NOT EXISTS late_notice_minutes INT NOT NULL DEFAULT 15
    CHECK (late_notice_minutes >= 0 AND late_notice_minutes <= 20160);

COMMENT ON COLUMN public.teams.absence_notice_minutes IS
  'Délai avant la séance (minutes) au-delà duquel un joueur ne peut plus se déclarer absent lui-même.';
COMMENT ON COLUMN public.teams.late_notice_minutes IS
  'Délai avant la séance (minutes) au-delà duquel un joueur ne peut plus se déclarer présent/en retard/blessé lui-même.';

-- La policy UPDATE existante sur teams (has_team_write_access(id), 20250118000007) couvre
-- déjà ces nouvelles colonnes sans rien changer : un coach peut modifier sa propre équipe,
-- un admin toutes les équipes de son club. Aucune policy à toucher.

CREATE OR REPLACE FUNCTION public.set_my_training_attendance(p_training_id UUID, p_status TEXT)
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
  v_attendance_excused JSONB;
  v_training_date TIMESTAMPTZ;
  v_deadline TIMESTAMPTZ;
  v_absence_notice_minutes INT;
  v_late_notice_minutes INT;
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

  SELECT absence_notice_minutes, late_notice_minutes
  INTO v_absence_notice_minutes, v_late_notice_minutes
  FROM teams WHERE id = v_team_id;

  v_deadline := CASE WHEN p_status = 'absent'
                      THEN v_training_date - (COALESCE(v_absence_notice_minutes, 360) || ' minutes')::INTERVAL
                      ELSE v_training_date - (COALESCE(v_late_notice_minutes, 15) || ' minutes')::INTERVAL
                 END;
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

  SELECT COALESCE(tr.attendance, '{}'::jsonb), COALESCE(tr.attendance_excused, '{}'::jsonb)
  INTO v_attendance, v_attendance_excused
  FROM trainings tr
  WHERE tr.id = p_training_id;

  v_attendance := jsonb_set(v_attendance, ARRAY[v_player_id::text], to_jsonb(p_status::text), true);
  IF p_status IN ('absent', 'late') THEN
    v_attendance_excused := jsonb_set(v_attendance_excused, ARRAY[v_player_id::text], 'true'::jsonb, true);
  END IF;

  UPDATE trainings
  SET attendance = v_attendance,
      attendance_excused = v_attendance_excused
  WHERE id = p_training_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── get_my_calendar_events : le client a besoin des délais par séance pour griser le
-- bon bouton au bon moment (chaque ligne peut être une équipe différente — joueur
-- multi-équipes ou convoqué ailleurs). Étend la ligne trainings, rien d'autre ne change.
CREATE OR REPLACE FUNCTION public.get_my_calendar_events()
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

  v_from_paris := ((NOW() AT TIME ZONE 'Europe/Paris')::date::timestamp AT TIME ZONE 'Europe/Paris');

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
      (tr.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team,
      t.absence_notice_minutes,
      t.late_notice_minutes
    FROM trainings tr
    JOIN teams t ON t.id = tr.team_id
    LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
      AND tft.player_id = v_player_id
      AND tft.used_at IS NULL
      AND tft.expires_at > NOW()
    WHERE tr.date >= v_from_paris
      AND (
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
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

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
