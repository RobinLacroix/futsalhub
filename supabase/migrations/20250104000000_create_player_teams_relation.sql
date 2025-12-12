-- Migration pour permettre à un joueur d'appartenir à plusieurs équipes
-- Crée une relation many-to-many entre players et teams

-- 1. Créer la table de liaison player_teams
CREATE TABLE IF NOT EXISTS player_teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(player_id, team_id) -- Un joueur ne peut être qu'une fois dans une équipe
);

-- 2. Créer des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_player_teams_player_id ON player_teams(player_id);
CREATE INDEX IF NOT EXISTS idx_player_teams_team_id ON player_teams(team_id);

-- 3. Migrer les données existantes : créer des entrées dans player_teams pour chaque joueur existant
INSERT INTO player_teams (player_id, team_id)
SELECT id, team_id 
FROM players 
WHERE team_id IS NOT NULL
ON CONFLICT (player_id, team_id) DO NOTHING;

-- 4. Rendre team_id optionnel dans players (pour rétrocompatibilité, on garde comme équipe "principale")
ALTER TABLE players ALTER COLUMN team_id DROP NOT NULL;

-- 5. RLS policies pour la sécurité
ALTER TABLE player_teams ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre aux utilisateurs authentifiés de voir toutes les relations
CREATE POLICY "Users can view all player_teams" ON player_teams
  FOR SELECT USING (auth.role() = 'authenticated');

-- Politique pour permettre aux utilisateurs authentifiés de modifier les relations
CREATE POLICY "Users can modify player_teams" ON player_teams
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. Fonction helper pour obtenir les équipes d'un joueur
CREATE OR REPLACE FUNCTION get_player_teams(p_player_id UUID)
RETURNS TABLE (
  team_id UUID,
  team_name VARCHAR(100),
  team_category VARCHAR(50),
  team_level VARCHAR(50),
  team_color VARCHAR(7)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.category,
    t.level,
    t.color
  FROM player_teams pt
  JOIN teams t ON t.id = pt.team_id
  WHERE pt.player_id = p_player_id
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Fonction helper pour obtenir les joueurs d'une équipe
CREATE OR REPLACE FUNCTION get_team_players(p_team_id UUID)
RETURNS TABLE (
  player_id UUID,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  age INTEGER,
  "position" VARCHAR(50),
  number INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.first_name,
    p.last_name,
    p.age,
    p."position",
    p.number
  FROM player_teams pt
  JOIN players p ON p.id = pt.player_id
  WHERE pt.team_id = p_team_id
  ORDER BY p.last_name, p.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Commentaires pour la documentation
COMMENT ON TABLE player_teams IS 'Relation many-to-many entre joueurs et équipes';
COMMENT ON COLUMN player_teams.player_id IS 'ID du joueur';
COMMENT ON COLUMN player_teams.team_id IS 'ID de l''équipe';

