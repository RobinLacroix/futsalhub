-- Absences/retards prévenus vs non prévenus, pour la gestion de l'effectif.
--
-- Règle validée par Robin : est "prévenu"
--   (a) un joueur qui se déclare absent/en retard lui-même dans l'appli avant la séance
--       (le délai d'1h, cf. 20260822130000, garantit que c'est fait à temps) — automatique,
--   (b) OU un coach qui coche explicitement "prévenu" en saisissant les présences a
--       posteriori (le joueur l'a prévenu hors appli — SMS, oral).
-- Par défaut (coach qui marque absent/retard sans cocher la case) : non prévenu.
--
-- Dimension indépendante du statut existant (present/absent/late/injured), pas une
-- extension de l'enum : un statut composé (absent_excused, absent_unexcused, ...) aurait
-- fallu propager dans tous les endroits qui font `IN ('absent','late','injured')`
-- (triggers de notif, tri des listes, badges) — surface d'erreur inutile pour une info qui
-- n'a de sens que pour absent/late. Une jsonb miroir de `attendance`, comme
-- `convoked_players`, est le pattern déjà en place sur cette table.
ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS attendance_excused JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.trainings.attendance_excused IS
  'Map player_id -> boolean. Pertinent seulement quand attendance[player_id] IN (absent, late). Absence de clé = non prévenu.';

-- Le joueur qui se déclare lui-même avant la deadline est prévenu par construction.
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

  v_deadline := v_training_date - INTERVAL '1 hour';
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
