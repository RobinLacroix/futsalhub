-- Table pour le feedback individuel des joueurs sur les entraînements
-- Permet de stocker les auto-évaluations après chaque séance

CREATE TABLE IF NOT EXISTS training_player_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Notes de 1 à 10 (1 = très faible, 10 = très élevé)
  auto_evaluation SMALLINT CHECK (auto_evaluation BETWEEN 1 AND 10),
  rpe SMALLINT CHECK (rpe BETWEEN 1 AND 10), -- intensité perçue
  physical_form SMALLINT CHECK (physical_form BETWEEN 1 AND 10),
  pleasure SMALLINT CHECK (pleasure BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (training_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_training_player_feedback_training_id
  ON training_player_feedback(training_id);

CREATE INDEX IF NOT EXISTS idx_training_player_feedback_player_id
  ON training_player_feedback(player_id);

-- RLS : accès limité aux clubs via trainings.team_id -> teams.club_id
ALTER TABLE training_player_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams') THEN
    -- Lecture
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'training_player_feedback' AND policyname = 'Users can view training_player_feedback'
    ) THEN
      CREATE POLICY "Users can view training_player_feedback" ON training_player_feedback
        FOR SELECT USING (
          EXISTS (
            SELECT 1 
            FROM trainings tr
            JOIN teams t ON t.id = tr.team_id
            WHERE tr.id = training_player_feedback.training_id
              AND t.club_id IS NOT NULL
              AND has_club_access(t.club_id)
          )
        );
    END IF;

    -- Insertion
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'training_player_feedback' AND policyname = 'Users can insert training_player_feedback'
    ) THEN
      CREATE POLICY "Users can insert training_player_feedback" ON training_player_feedback
        FOR INSERT WITH CHECK (
          EXISTS (
            SELECT 1 
            FROM trainings tr
            JOIN teams t ON t.id = tr.team_id
            WHERE tr.id = training_player_feedback.training_id
              AND t.club_id IS NOT NULL
              AND has_club_access(t.club_id)
          )
        );
    END IF;

    -- Mise à jour
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'training_player_feedback' AND policyname = 'Users can update training_player_feedback'
    ) THEN
      CREATE POLICY "Users can update training_player_feedback" ON training_player_feedback
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 
            FROM trainings tr
            JOIN teams t ON t.id = tr.team_id
            WHERE tr.id = training_player_feedback.training_id
              AND t.club_id IS NOT NULL
              AND has_club_access(t.club_id)
          )
        );
    END IF;

    -- Suppression
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'training_player_feedback' AND policyname = 'Users can delete training_player_feedback'
    ) THEN
      CREATE POLICY "Users can delete training_player_feedback" ON training_player_feedback
        FOR DELETE USING (
          EXISTS (
            SELECT 1 
            FROM trainings tr
            JOIN teams t ON t.id = tr.team_id
            WHERE tr.id = training_player_feedback.training_id
              AND t.club_id IS NOT NULL
              AND has_club_access(t.club_id)
          )
        );
    END IF;
  END IF;
END $$;

COMMENT ON TABLE training_player_feedback IS 'Auto-évaluations des joueurs après chaque entraînement (auto-éval, RPE, forme, plaisir)';

