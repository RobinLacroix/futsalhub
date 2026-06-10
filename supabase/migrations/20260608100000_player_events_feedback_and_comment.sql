-- 1. Étendre le CHECK constraint pour accepter le type 'feedback'
ALTER TABLE player_events
  DROP CONSTRAINT IF EXISTS player_events_event_type_check;

ALTER TABLE player_events
  ADD CONSTRAINT player_events_event_type_check
  CHECK (event_type IN ('interview', 'injury', 'suspension', 'feedback'));

-- 2. Mettre à jour submit_training_feedback pour accepter un commentaire optionnel
--    Si le commentaire est non-vide, un player_event de type 'feedback' est créé.
CREATE OR REPLACE FUNCTION submit_training_feedback(
  p_token            TEXT,
  p_auto_evaluation  SMALLINT,
  p_rpe              SMALLINT,
  p_physical_form    SMALLINT,
  p_pleasure         SMALLINT,
  p_comment          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_player_id   UUID;
  v_expires_at  TIMESTAMPTZ;
  v_used_at     TIMESTAMPTZ;
BEGIN
  SELECT tft.training_id, tft.player_id, tft.expires_at, tft.used_at
    INTO v_training_id, v_player_id, v_expires_at, v_used_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_training_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;
  IF p_auto_evaluation IS NULL OR p_auto_evaluation < 1 OR p_auto_evaluation > 10
     OR p_rpe IS NULL OR p_rpe < 1 OR p_rpe > 10
     OR p_physical_form IS NULL OR p_physical_form < 1 OR p_physical_form > 10
     OR p_pleasure IS NULL OR p_pleasure < 1 OR p_pleasure > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_values');
  END IF;

  INSERT INTO training_player_feedback
    (training_id, player_id, auto_evaluation, rpe, physical_form, pleasure, updated_at)
  VALUES
    (v_training_id, v_player_id, p_auto_evaluation, p_rpe, p_physical_form, p_pleasure, NOW())
  ON CONFLICT (training_id, player_id) DO UPDATE SET
    auto_evaluation = EXCLUDED.auto_evaluation,
    rpe             = EXCLUDED.rpe,
    physical_form   = EXCLUDED.physical_form,
    pleasure        = EXCLUDED.pleasure,
    updated_at      = NOW();

  UPDATE training_feedback_tokens
  SET used_at = NOW()
  WHERE token = p_token;

  -- Créer un player_event de type 'feedback' si un commentaire est fourni
  IF p_comment IS NOT NULL AND trim(p_comment) <> '' THEN
    INSERT INTO player_events (player_id, event_type, event_date, report)
    VALUES (v_player_id, 'feedback', CURRENT_DATE, trim(p_comment));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Regrant avec la nouvelle signature (remplace l'ancien grant)
REVOKE ALL ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) TO authenticated;
