-- Permettre la suppression d'une équipe en modifiant les clés étrangères
-- Sans ces modifications, players, matches et trainings bloquent la suppression (RESTRICT par défaut)

-- players.team_id : SET NULL (le joueur reste, il perd juste son équipe principale)
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_team_id_fkey;
ALTER TABLE players ADD CONSTRAINT players_team_id_fkey 
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- matches.team_id : CASCADE (les matchs de l'équipe sont supprimés)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_team_id_fkey;
ALTER TABLE matches ADD CONSTRAINT matches_team_id_fkey 
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- trainings.team_id : CASCADE (les entraînements de l'équipe sont supprimés)
ALTER TABLE trainings DROP CONSTRAINT IF EXISTS trainings_team_id_fkey;
ALTER TABLE trainings ADD CONSTRAINT trainings_team_id_fkey 
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
