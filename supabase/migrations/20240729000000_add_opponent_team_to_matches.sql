-- Add opponent_team column to matches table
ALTER TABLE matches
ADD COLUMN opponent_team TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN matches.opponent_team IS 'Nom de l''équipe adverse';

-- Create index for better performance
CREATE INDEX idx_matches_opponent_team ON matches (opponent_team); 