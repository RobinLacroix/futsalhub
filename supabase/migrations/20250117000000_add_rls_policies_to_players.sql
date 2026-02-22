-- Migration pour ajouter les politiques RLS à la table players
-- Permet aux utilisateurs authentifiés de gérer les joueurs

-- Activer RLS sur la table players si ce n'est pas déjà fait
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent (pour éviter les doublons)
DROP POLICY IF EXISTS "Users can view all players" ON players;
DROP POLICY IF EXISTS "Users can insert players" ON players;
DROP POLICY IF EXISTS "Users can update players" ON players;
DROP POLICY IF EXISTS "Users can delete players" ON players;

-- Politique pour permettre aux utilisateurs authentifiés de voir tous les joueurs
CREATE POLICY "Users can view all players" ON players
  FOR SELECT USING (auth.role() = 'authenticated');

-- Politique pour permettre aux utilisateurs authentifiés d'insérer des joueurs
CREATE POLICY "Users can insert players" ON players
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Politique pour permettre aux utilisateurs authentifiés de modifier les joueurs
CREATE POLICY "Users can update players" ON players
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Politique pour permettre aux utilisateurs authentifiés de supprimer les joueurs
CREATE POLICY "Users can delete players" ON players
  FOR DELETE USING (auth.role() = 'authenticated');

-- Commentaires pour la documentation
COMMENT ON POLICY "Users can view all players" ON players IS 'Permet aux utilisateurs authentifiés de voir tous les joueurs';
COMMENT ON POLICY "Users can insert players" ON players IS 'Permet aux utilisateurs authentifiés d''ajouter des joueurs';
COMMENT ON POLICY "Users can update players" ON players IS 'Permet aux utilisateurs authentifiés de modifier les joueurs';
COMMENT ON POLICY "Users can delete players" ON players IS 'Permet aux utilisateurs authentifiés de supprimer les joueurs';
