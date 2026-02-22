-- ============================================
-- ÉTAPE 5 : Ajouter les politiques RLS pour les clubs et club_members
-- ============================================

-- RLS pour clubs
-- Les utilisateurs peuvent voir les clubs auxquels ils appartiennent
CREATE POLICY "Users can view their clubs" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
        AND club_members.user_id = auth.uid()
    )
  );

-- Seuls les admins peuvent modifier les clubs
CREATE POLICY "Admins can modify clubs" ON clubs
  FOR ALL USING (is_club_admin(clubs.id));

-- RLS pour club_members
-- Les utilisateurs peuvent voir leurs propres membreships
CREATE POLICY "Users can view their memberships" ON club_members
  FOR SELECT USING (user_id = auth.uid());

-- Les admins peuvent voir tous les membres de leur club
CREATE POLICY "Admins can view club members" ON club_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_members.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

-- Seuls les admins peuvent modifier les membres
CREATE POLICY "Admins can modify club members" ON club_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = club_members.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

-- RLS pour teams
-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Users can view all teams" ON teams;
DROP POLICY IF EXISTS "Users can modify teams" ON teams;

-- Nouvelles politiques RLS pour teams
CREATE POLICY "Users can view their club teams" ON teams
  FOR SELECT USING (
    club_id IS NOT NULL AND has_club_access(club_id)
  );

CREATE POLICY "Users can insert teams in their club" ON teams
  FOR INSERT WITH CHECK (
    club_id IS NOT NULL AND has_club_access(club_id)
  );

CREATE POLICY "Users can update their club teams" ON teams
  FOR UPDATE USING (has_team_access(teams.id));

CREATE POLICY "Users can delete their club teams" ON teams
  FOR DELETE USING (has_team_access(teams.id));
