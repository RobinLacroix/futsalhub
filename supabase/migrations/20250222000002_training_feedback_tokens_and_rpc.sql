-- Table des tokens pour accéder au questionnaire de feedback (lien unique par joueur/séance)
CREATE TABLE IF NOT EXISTS training_feedback_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (training_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_training_feedback_tokens_token ON training_feedback_tokens(token);
CREATE INDEX IF NOT EXISTS idx_training_feedback_tokens_expires ON training_feedback_tokens(expires_at);

-- RLS : seuls les coachs/admins du club peuvent gérer les tokens
ALTER TABLE training_feedback_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage tokens for their club trainings" ON training_feedback_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM trainings tr
      JOIN teams t ON t.id = tr.team_id
      WHERE tr.id = training_feedback_tokens.training_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

-- RPC : récupérer les infos de la séance par token (appelable sans auth pour la page joueur)
CREATE OR REPLACE FUNCTION get_feedback_session_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_player_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_used_at TIMESTAMPTZ;
  v_training_date TIMESTAMPTZ;
  v_theme TEXT;
  v_player_name TEXT;
BEGIN
  SELECT tft.training_id, tft.player_id, tft.expires_at, tft.used_at
    INTO v_training_id, v_player_id, v_expires_at, v_used_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_training_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT tr.date, tr.theme
    INTO v_training_date, v_theme
  FROM trainings tr
  WHERE tr.id = v_training_id;

  SELECT p.first_name || ' ' || p.last_name
    INTO v_player_name
  FROM players p
  WHERE p.id = v_player_id;

  RETURN jsonb_build_object(
    'training_id', v_training_id,
    'player_id', v_player_id,
    'training_date', v_training_date,
    'theme', v_theme,
    'player_name', v_player_name
  );
END;
$$;

-- RPC : soumettre le feedback (vérifie le token puis insère/met à jour)
CREATE OR REPLACE FUNCTION submit_training_feedback(
  p_token TEXT,
  p_auto_evaluation SMALLINT,
  p_rpe SMALLINT,
  p_physical_form SMALLINT,
  p_pleasure SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_player_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_used_at TIMESTAMPTZ;
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

  INSERT INTO training_player_feedback (training_id, player_id, auto_evaluation, rpe, physical_form, pleasure, updated_at)
  VALUES (v_training_id, v_player_id, p_auto_evaluation, p_rpe, p_physical_form, p_pleasure, NOW())
  ON CONFLICT (training_id, player_id)
  DO UPDATE SET
    auto_evaluation = EXCLUDED.auto_evaluation,
    rpe = EXCLUDED.rpe,
    physical_form = EXCLUDED.physical_form,
    pleasure = EXCLUDED.pleasure,
    updated_at = NOW();

  UPDATE training_feedback_tokens
  SET used_at = NOW()
  WHERE token = p_token;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Permettre l'appel des RPC sans être connecté (anon + service_role)
GRANT EXECUTE ON FUNCTION get_feedback_session_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_feedback_session_by_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT) TO anon;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT) TO authenticated;

COMMENT ON TABLE training_feedback_tokens IS 'Tokens uniques pour que les joueurs accèdent au questionnaire de feedback (lien par séance/joueur)';
