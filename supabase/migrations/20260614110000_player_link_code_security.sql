-- Security: increase player link code entropy (8 → 12 chars) + rate limiting
-- 8 chars = 32^8 ≈ 10^12 brute-forceable without rate limiting.
-- 12 chars = 32^12 ≈ 10^18, plus we add max 5 failed attempts per hour per user.

-- Table to track failed claim attempts for rate limiting
CREATE TABLE IF NOT EXISTS player_link_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_code_attempts_user_time
  ON player_link_code_attempts(user_id, attempted_at);

-- Auto-clean attempts older than 1 hour (keep table small)
CREATE OR REPLACE FUNCTION prune_link_code_attempts() RETURNS VOID
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM player_link_code_attempts WHERE attempted_at < NOW() - INTERVAL '1 hour';
$$;

-- Updated gen_link_code: 12 characters instead of 8
CREATE OR REPLACE FUNCTION gen_link_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Updated claim_player_link_code with rate limiting (max 5 attempts/hour per user)
CREATE OR REPLACE FUNCTION claim_player_link_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_uid UUID;
  v_attempt_count INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- Rate limit: max 5 failed attempts in the last hour
  SELECT COUNT(*) INTO v_attempt_count
  FROM player_link_code_attempts
  WHERE user_id = v_uid
    AND attempted_at > NOW() - INTERVAL '1 hour';

  IF v_attempt_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  END IF;

  SELECT id, player_id, expires_at INTO v_row
  FROM player_link_codes
  WHERE code = trim(upper(p_code))
  LIMIT 1;

  IF v_row.id IS NULL THEN
    -- Record failed attempt
    INSERT INTO player_link_code_attempts(user_id) VALUES (v_uid);
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF v_row.expires_at < NOW() THEN
    DELETE FROM player_link_codes WHERE id = v_row.id;
    INSERT INTO player_link_code_attempts(user_id) VALUES (v_uid);
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;

  -- Un user ne peut être lié qu'à un seul joueur
  IF EXISTS (SELECT 1 FROM players WHERE user_id = v_uid AND id != v_row.player_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_linked_other');
  END IF;

  UPDATE players SET user_id = v_uid WHERE id = v_row.player_id;
  DELETE FROM player_link_codes WHERE id = v_row.id;
  -- Clean up old attempts on success
  PERFORM prune_link_code_attempts();

  RETURN jsonb_build_object('ok', true);
END;
$$;
