-- Migration pour ajouter la gestion des équipes
-- Permet de gérer plusieurs équipes du même club

-- 1. Créer la table teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50), -- ex: "Senior", "U19", "U17", etc.
  level VARCHAR(50), -- ex: "A", "B", "C"
  color VARCHAR(7), -- couleur hexadécimale pour identifier l'équipe
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ajouter le champ team_id aux tables existantes
ALTER TABLE players ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- 3. Créer des index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_id ON matches(team_id);
CREATE INDEX IF NOT EXISTS idx_trainings_team_id ON trainings(team_id);
CREATE INDEX IF NOT EXISTS idx_match_events_team_id ON match_events(team_id);

-- 4. Insérer des équipes par défaut
INSERT INTO teams (id, name, category, level, color) VALUES 
  (gen_random_uuid(), 'Équipe A', 'Senior', 'A', '#3B82F6'),
  (gen_random_uuid(), 'Équipe B', 'Senior', 'B', '#10B981'),
  (gen_random_uuid(), 'U19', 'U19', 'A', '#F59E0B'),
  (gen_random_uuid(), 'U17', 'U17', 'A', '#EF4444')
ON CONFLICT DO NOTHING;

-- 5. Mettre à jour les données existantes pour les associer à l'équipe A par défaut
UPDATE players SET team_id = (SELECT id FROM teams WHERE name = 'Équipe A' LIMIT 1) WHERE team_id IS NULL;
UPDATE matches SET team_id = (SELECT id FROM teams WHERE name = 'Équipe A' LIMIT 1) WHERE team_id IS NULL;
UPDATE trainings SET team_id = (SELECT id FROM teams WHERE name = 'Équipe A' LIMIT 1) WHERE team_id IS NULL;
UPDATE match_events SET team_id = (SELECT id FROM teams WHERE name = 'Équipe A' LIMIT 1) WHERE team_id IS NULL;

-- 6. Rendre le champ team_id obligatoire pour les nouvelles données
ALTER TABLE players ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE trainings ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE match_events ALTER COLUMN team_id SET NOT NULL;

-- 7. Créer des politiques RLS pour la sécurité
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre aux utilisateurs authentifiés de voir toutes les équipes
CREATE POLICY "Users can view all teams" ON teams
  FOR SELECT USING (auth.role() = 'authenticated');

-- Politique pour permettre aux utilisateurs authentifiés de modifier les équipes
CREATE POLICY "Users can modify teams" ON teams
  FOR ALL USING (auth.role() = 'authenticated');

-- 8. Commentaires pour la documentation
COMMENT ON TABLE teams IS 'Gestion des équipes du club';
COMMENT ON COLUMN teams.name IS 'Nom de l''équipe';
COMMENT ON COLUMN teams.category IS 'Catégorie d''âge de l''équipe';
COMMENT ON COLUMN teams.level IS 'Niveau de l''équipe (A, B, C, etc.)';
COMMENT ON COLUMN teams.color IS 'Couleur d''identification de l''équipe';

-- 9. Fonction pour obtenir les statistiques par équipe
CREATE OR REPLACE FUNCTION get_team_stats(team_uuid UUID)
RETURNS TABLE (
  total_players INTEGER,
  total_matches INTEGER,
  total_trainings INTEGER,
  total_goals INTEGER,
  total_attendance INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT p.id)::INTEGER as total_players,
    COUNT(DISTINCT m.id)::INTEGER as total_matches,
    COUNT(DISTINCT t.id)::INTEGER as total_trainings,
    COALESCE(SUM(me.goals), 0)::INTEGER as total_goals,
    COUNT(DISTINCT t.id)::INTEGER as total_attendance
  FROM teams tm
  LEFT JOIN players p ON p.team_id = tm.id
  LEFT JOIN matches m ON m.team_id = tm.id
  LEFT JOIN trainings t ON t.team_id = tm.id
  LEFT JOIN match_events me ON me.team_id = tm.id AND me.event_type = 'goal'
  WHERE tm.id = team_uuid
  GROUP BY tm.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Vues utiles pour l'analyse par équipe
CREATE OR REPLACE VIEW team_overview AS
SELECT 
  t.id,
  t.name,
  t.category,
  t.level,
  t.color,
  COUNT(DISTINCT p.id) as player_count,
  COUNT(DISTINCT m.id) as match_count,
  COUNT(DISTINCT tr.id) as training_count
FROM teams t
LEFT JOIN players p ON p.team_id = t.id
LEFT JOIN matches m ON m.team_id = t.id
LEFT JOIN trainings tr ON tr.team_id = t.id
GROUP BY t.id, t.name, t.category, t.level, t.color
ORDER BY t.name;
