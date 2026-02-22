-- ============================================
-- ÉTAPE 2 : Ajouter club_id à la table teams
-- ============================================
-- Une équipe appartient à un club

-- Ajouter club_id à teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_teams_club_id ON teams(club_id);

-- Commentaires
COMMENT ON COLUMN teams.club_id IS 'ID du club auquel appartient l''équipe';
