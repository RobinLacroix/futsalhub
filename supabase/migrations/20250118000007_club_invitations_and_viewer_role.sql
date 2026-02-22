-- ============================================
-- Table club_invitations + rôle viewer
-- ============================================

-- 1. Table des invitations
CREATE TABLE IF NOT EXISTS club_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'coach', 'viewer')),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_invitations_token ON club_invitations(token);
CREATE INDEX IF NOT EXISTS idx_club_invitations_club_id ON club_invitations(club_id);
CREATE INDEX IF NOT EXISTS idx_club_invitations_email ON club_invitations(email);

ALTER TABLE club_invitations ENABLE ROW LEVEL SECURITY;

-- Les admins du club peuvent gérer les invitations
CREATE POLICY "Admins can manage invitations" ON club_invitations
  FOR ALL USING (
    is_club_admin(club_id)
  );

-- 2. Ajouter le rôle viewer à club_members
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_role_check 
  CHECK (role IN ('admin', 'coach', 'viewer'));

-- 3. Fonction pour accepter une invitation
CREATE OR REPLACE FUNCTION accept_club_invitation(p_token UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_invitation club_invitations%ROWTYPE;
  v_club_id UUID;
BEGIN
  SELECT * INTO v_invitation
  FROM club_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();
  
  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation invalide ou expirée';
  END IF;
  
  -- Vérifier que l'email correspond
  IF LOWER((SELECT email FROM auth.users WHERE id = p_user_id)) != LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Cette invitation est destinée à un autre email';
  END IF;
  
  -- Créer le membership (si pas déjà membre)
  INSERT INTO club_members (user_id, club_id, role, team_id)
  SELECT p_user_id, v_invitation.club_id, v_invitation.role, v_invitation.team_id
  WHERE NOT EXISTS (
    SELECT 1 FROM club_members WHERE user_id = p_user_id AND club_id = v_invitation.club_id
  );
  
  -- Marquer l'invitation comme acceptée
  UPDATE club_invitations SET status = 'accepted' WHERE id = v_invitation.id;
  
  RETURN v_invitation.club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Mettre à jour has_club_access pour inclure viewer (lecture)
CREATE OR REPLACE FUNCTION has_club_access(p_club_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p_club_id
      AND (cm.role IN ('admin', 'coach', 'viewer'))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Nouvelle fonction: accès en écriture (admin ou coach)
CREATE OR REPLACE FUNCTION has_club_write_access(p_club_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p_club_id
      AND cm.role IN ('admin', 'coach')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. Mettre à jour has_team_access pour inclure viewer (lecture)
CREATE OR REPLACE FUNCTION has_team_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
BEGIN
  SELECT club_id INTO v_club_id FROM teams WHERE id = p_team_id;
  IF v_club_id IS NULL THEN RETURN FALSE; END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = v_club_id
      AND (
        cm.role = 'admin'
        OR (cm.role = 'coach' AND cm.team_id = p_team_id)
        OR (cm.role = 'viewer' AND (cm.team_id = p_team_id OR cm.team_id IS NULL))
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 7. Nouvelle fonction: accès en écriture à une équipe
CREATE OR REPLACE FUNCTION has_team_write_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
BEGIN
  SELECT club_id INTO v_club_id FROM teams WHERE id = p_team_id;
  IF v_club_id IS NULL THEN RETURN FALSE; END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = v_club_id
      AND (
        cm.role = 'admin'
        OR (cm.role = 'coach' AND cm.team_id = p_team_id)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 8. Mise à jour RLS: write policies utilisent has_club_write_access / has_team_write_access
-- Players
DROP POLICY IF EXISTS "Users can insert players in their club" ON players;
DROP POLICY IF EXISTS "Users can update their club players" ON players;
DROP POLICY IF EXISTS "Users can delete their club players" ON players;
CREATE POLICY "Users can insert players in their club" ON players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can update their club players" ON players FOR UPDATE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can delete their club players" ON players FOR DELETE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);

-- Matches
DROP POLICY IF EXISTS "Users can insert matches in their club" ON matches;
DROP POLICY IF EXISTS "Users can update their club matches" ON matches;
DROP POLICY IF EXISTS "Users can delete their club matches" ON matches;
CREATE POLICY "Users can insert matches in their club" ON matches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can update their club matches" ON matches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can delete their club matches" ON matches FOR DELETE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);

-- Teams (step 5 - need write access)
DROP POLICY IF EXISTS "Users can insert teams in their club" ON teams;
DROP POLICY IF EXISTS "Users can update their club teams" ON teams;
DROP POLICY IF EXISTS "Users can delete their club teams" ON teams;
CREATE POLICY "Users can insert teams in their club" ON teams FOR INSERT WITH CHECK (club_id IS NOT NULL AND has_club_write_access(club_id));
CREATE POLICY "Users can update their club teams" ON teams FOR UPDATE USING (has_team_write_access(teams.id));
CREATE POLICY "Users can delete their club teams" ON teams FOR DELETE USING (has_team_write_access(teams.id));

-- Player_teams
DROP POLICY IF EXISTS "Users can insert player_teams in their club" ON player_teams;
DROP POLICY IF EXISTS "Users can update their club player_teams" ON player_teams;
DROP POLICY IF EXISTS "Users can delete their club player_teams" ON player_teams;
CREATE POLICY "Users can insert player_teams in their club" ON player_teams FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can update their club player_teams" ON player_teams FOR UPDATE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
CREATE POLICY "Users can delete their club player_teams" ON player_teams FOR DELETE USING (
  EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND t.club_id IS NOT NULL AND has_club_write_access(t.club_id))
);
