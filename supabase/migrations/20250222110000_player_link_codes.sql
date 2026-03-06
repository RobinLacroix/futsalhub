-- ============================================
-- Codes de liaison joueur <-> compte utilisateur
-- Le coach génère un code ; le joueur le saisit dans Paramètres pour lier son compte.
-- ============================================

CREATE TABLE IF NOT EXISTS player_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_link_codes_code ON player_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_player_link_codes_expires ON player_link_codes(expires_at);

ALTER TABLE player_link_codes ENABLE ROW LEVEL SECURITY;

-- Seuls les coachs/admins du club du joueur peuvent créer ou voir les codes
CREATE POLICY "Coaches can manage link codes for their club players" ON player_link_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM players p
      LEFT JOIN teams t ON t.id = p.team_id
      LEFT JOIN player_teams pt ON pt.player_id = p.id
      LEFT JOIN teams t2 ON t2.id = pt.team_id
      WHERE p.id = player_link_codes.player_id
        AND (t.club_id IS NOT NULL AND has_club_access(t.club_id)
             OR t2.club_id IS NOT NULL AND has_club_access(t2.club_id))
    )
  );

-- Fonction pour générer un code aléatoire (8 caractères alphanumériques)
CREATE OR REPLACE FUNCTION gen_link_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- RPC : créer un code de liaison pour un joueur (coach/admin du club uniquement)
CREATE OR REPLACE FUNCTION create_player_link_code(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_expires_at TIMESTAMPTZ;
  v_has_access BOOLEAN;
BEGIN
  -- Vérifier que l'appelant a accès au joueur (club)
  SELECT EXISTS (
    SELECT 1 FROM players p
    LEFT JOIN teams t ON t.id = p.team_id
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    LEFT JOIN teams t2 ON t2.id = pt.team_id
    WHERE p.id = p_player_id
      AND ( (t.club_id IS NOT NULL AND has_club_access(t.club_id))
            OR (t2.club_id IS NOT NULL AND has_club_access(t2.club_id)) )
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_access');
  END IF;

  -- Invalider les anciens codes pour ce joueur
  DELETE FROM player_link_codes WHERE player_id = p_player_id;

  v_code := gen_link_code();
  v_expires_at := NOW() + INTERVAL '24 hours';

  INSERT INTO player_link_codes (player_id, code, expires_at)
  VALUES (p_player_id, v_code, v_expires_at);

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expires_at);
END;
$$;

-- RPC : lier son compte au joueur en saisissant le code (utilisateur connecté)
CREATE OR REPLACE FUNCTION claim_player_link_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT id, player_id, expires_at INTO v_row
  FROM player_link_codes
  WHERE code = trim(upper(p_code))
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF v_row.expires_at < NOW() THEN
    DELETE FROM player_link_codes WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;

  -- Un autre joueur ne peut pas déjà être lié à ce user_id (un user = un joueur)
  IF EXISTS (SELECT 1 FROM players WHERE user_id = v_uid AND id != v_row.player_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_linked_other');
  END IF;

  UPDATE players SET user_id = v_uid WHERE id = v_row.player_id;
  DELETE FROM player_link_codes WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON TABLE player_link_codes IS 'Codes à usage unique pour lier un compte utilisateur à une fiche joueur';
