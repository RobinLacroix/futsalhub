-- Migration pour le suivi des présences aux entraînements
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Créer la table training_attendance
CREATE TABLE IF NOT EXISTS training_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  training_id UUID REFERENCES trainings(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('present', 'absent', 'injured')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(training_id, player_id)
);

-- 2. Créer les index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_training_attendance_training_id ON training_attendance(training_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_player_id ON training_attendance(player_id);
CREATE INDEX IF NOT EXISTS idx_training_attendance_status ON training_attendance(status);

-- 3. Fonction pour obtenir les statistiques collectives
CREATE OR REPLACE FUNCTION get_training_collective_stats(
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_sessions INTEGER,
  avg_present INTEGER,
  avg_absent INTEGER,
  avg_injured INTEGER,
  total_present INTEGER,
  total_absent INTEGER,
  total_injured INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT t.id)::INTEGER as total_sessions,
    ROUND(AVG(COUNT(CASE WHEN ta.status = 'present' THEN 1 END)) OVER ())::INTEGER as avg_present,
    ROUND(AVG(COUNT(CASE WHEN ta.status = 'absent' THEN 1 END)) OVER ())::INTEGER as avg_absent,
    ROUND(AVG(COUNT(CASE WHEN ta.status = 'injured' THEN 1 END)) OVER ())::INTEGER as avg_injured,
    SUM(CASE WHEN ta.status = 'present' THEN 1 ELSE 0 END)::INTEGER as total_present,
    SUM(CASE WHEN ta.status = 'absent' THEN 1 ELSE 0 END)::INTEGER as total_absent,
    SUM(CASE WHEN ta.status = 'injured' THEN 1 ELSE 0 END)::INTEGER as total_injured
  FROM trainings t
  LEFT JOIN training_attendance ta ON t.id = ta.training_id
  WHERE (start_date IS NULL OR t.date >= start_date)
    AND (end_date IS NULL OR t.date <= end_date);
END;
$$ LANGUAGE plpgsql;

-- 4. Fonction pour obtenir les statistiques individuelles
CREATE OR REPLACE FUNCTION get_player_training_stats(
  player_id UUID,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_sessions INTEGER,
  sessions_present INTEGER,
  sessions_absent INTEGER,
  sessions_injured INTEGER,
  attendance_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT t.id)::INTEGER as total_sessions,
    COUNT(CASE WHEN ta.status = 'present' THEN 1 END)::INTEGER as sessions_present,
    COUNT(CASE WHEN ta.status = 'absent' THEN 1 END)::INTEGER as sessions_absent,
    COUNT(CASE WHEN ta.status = 'injured' THEN 1 END)::INTEGER as sessions_injured,
    ROUND(
      (COUNT(CASE WHEN ta.status = 'present' THEN 1 END)::DECIMAL / 
       COUNT(DISTINCT t.id)::DECIMAL) * 100, 2
    ) as attendance_rate
  FROM trainings t
  LEFT JOIN training_attendance ta ON t.id = ta.training_id AND ta.player_id = $1
  WHERE (start_date IS NULL OR t.date >= start_date)
    AND (end_date IS NULL OR t.date <= end_date);
END;
$$ LANGUAGE plpgsql;

-- 5. Politique RLS pour la table training_attendance
ALTER TABLE training_attendance ENABLE ROW LEVEL SECURITY;

-- Permettre la lecture pour les utilisateurs authentifiés
CREATE POLICY "Users can view training attendance" ON training_attendance
  FOR SELECT USING (auth.role() = 'authenticated');

-- Permettre l'insertion pour les utilisateurs authentifiés
CREATE POLICY "Users can insert training attendance" ON training_attendance
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Permettre la mise à jour pour les utilisateurs authentifiés
CREATE POLICY "Users can update training attendance" ON training_attendance
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Permettre la suppression pour les utilisateurs authentifiés
CREATE POLICY "Users can delete training attendance" ON training_attendance
  FOR DELETE USING (auth.role() = 'authenticated');

-- 6. Commentaires pour la documentation
COMMENT ON TABLE training_attendance IS 'Suivi des présences des joueurs aux entraînements';
COMMENT ON COLUMN training_attendance.status IS 'Statut du joueur: present, absent, ou injured';
COMMENT ON FUNCTION get_training_collective_stats IS 'Obtient les statistiques collectives de présence aux entraînements';
COMMENT ON FUNCTION get_player_training_stats IS 'Obtient les statistiques individuelles de présence d''un joueur';
