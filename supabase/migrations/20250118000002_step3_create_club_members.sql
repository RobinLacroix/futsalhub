-- ============================================
-- ÉTAPE 3 : Créer la table club_members pour gérer les rôles
-- ============================================
-- Cette table lie les utilisateurs aux clubs avec leurs rôles (admin ou entraîneur)

CREATE TABLE IF NOT EXISTS club_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'coach')),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL, -- NULL pour admin, UUID pour coach
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contraintes uniques pour éviter les doublons
-- Un utilisateur ne peut avoir qu'un rôle admin par club (team_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_members_unique_admin 
  ON club_members(user_id, club_id) 
  WHERE role = 'admin' AND team_id IS NULL;

-- Un utilisateur ne peut avoir qu'un rôle coach par équipe
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_members_unique_coach 
  ON club_members(user_id, club_id, team_id) 
  WHERE role = 'coach' AND team_id IS NOT NULL;

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_members_club_id ON club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_team_id ON club_members(team_id);
CREATE INDEX IF NOT EXISTS idx_club_members_role ON club_members(role);

-- Activer RLS
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Commentaires
COMMENT ON TABLE club_members IS 'Gestion des membres des clubs avec leurs rôles (admin ou entraîneur)';
COMMENT ON COLUMN club_members.role IS 'Rôle: admin (accès total au club) ou coach (accès limité à une équipe)';
COMMENT ON COLUMN club_members.team_id IS 'ID de l''équipe pour les entraîneurs (NULL pour les admins)';
