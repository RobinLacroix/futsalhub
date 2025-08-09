-- Add goals distribution columns to matches table
ALTER TABLE matches
ADD COLUMN goals_by_type JSONB NOT NULL DEFAULT '{
  "offensive": 0,
  "transition": 0,
  "cpa": 0,
  "superiority": 0
}'::jsonb,
ADD COLUMN conceded_by_type JSONB NOT NULL DEFAULT '{
  "offensive": 0,
  "transition": 0,
  "cpa": 0,
  "superiority": 0
}'::jsonb;

-- Add comment to explain the structure
COMMENT ON COLUMN matches.goals_by_type IS 'Répartition des buts marqués par type (offensive, transition, cpa, superiority)';
COMMENT ON COLUMN matches.conceded_by_type IS 'Répartition des buts encaissés par type (offensive, transition, cpa, superiority)';

-- Create indexes for better performance on JSON fields
CREATE INDEX idx_matches_goals_by_type ON matches USING gin (goals_by_type);
CREATE INDEX idx_matches_conceded_by_type ON matches USING gin (conceded_by_type); 