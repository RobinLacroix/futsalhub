-- Migration pour corriger la contrainte de clé étrangère sur player_teams
-- S'assure que la suppression d'un joueur supprime automatiquement ses relations avec les équipes

-- 1. Supprimer l'ancienne contrainte si elle existe
ALTER TABLE player_teams 
DROP CONSTRAINT IF EXISTS player_teams_player_id_fkey;

-- 2. Recréer la contrainte avec ON DELETE CASCADE
ALTER TABLE player_teams
ADD CONSTRAINT player_teams_player_id_fkey
FOREIGN KEY (player_id)
REFERENCES players(id)
ON DELETE CASCADE;

-- 3. Vérifier aussi la contrainte pour team_id (au cas où)
ALTER TABLE player_teams 
DROP CONSTRAINT IF EXISTS player_teams_team_id_fkey;

ALTER TABLE player_teams
ADD CONSTRAINT player_teams_team_id_fkey
FOREIGN KEY (team_id)
REFERENCES teams(id)
ON DELETE CASCADE;

-- Commentaire pour la documentation
COMMENT ON CONSTRAINT player_teams_player_id_fkey ON player_teams IS 
'Contrainte de clé étrangère avec CASCADE : la suppression d''un joueur supprime automatiquement toutes ses relations avec les équipes';
