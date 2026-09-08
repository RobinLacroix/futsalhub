-- Délai de prévenance différencié par statut, demandé par Robin :
--   - absent : 6h avant la séance (le staff a besoin de temps pour réorganiser)
--   - late, present, injured : 15 min avant la séance
-- Choix pour present/injured (non demandés explicitement) : les regrouper avec 'late'
-- plutôt que garder l'ancien délai uniforme de 1h — sinon 'present' aurait un délai
-- PLUS restrictif que 'late', ce qui n'a pas de sens (on peut confirmer sa présence ou
-- se déclarer en retard au dernier moment, seule une absence doit être annoncée à l'avance).
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

  v_deadline := CASE WHEN p_status = 'absent'
                      THEN v_training_date - INTERVAL '6 hours'
                      ELSE v_training_date - INTERVAL '15 minutes'
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
