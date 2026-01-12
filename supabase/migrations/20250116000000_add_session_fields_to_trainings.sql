-- Add session_duration and session_parts columns to trainings table
-- session_duration: integer for total session duration in minutes
-- session_parts: JSONB array to store the organization of the session with procedures

ALTER TABLE trainings
ADD COLUMN IF NOT EXISTS session_duration integer CHECK (session_duration IS NULL OR (session_duration >= 45 AND session_duration <= 150));

ALTER TABLE trainings
ADD COLUMN IF NOT EXISTS session_parts JSONB;

-- Add index for better query performance on session_duration
CREATE INDEX IF NOT EXISTS idx_trainings_session_duration ON trainings(session_duration);

-- Add GIN index for JSONB queries on session_parts
CREATE INDEX IF NOT EXISTS idx_trainings_session_parts ON trainings USING GIN (session_parts);

-- Comment for documentation
COMMENT ON COLUMN trainings.session_duration IS 'Durée totale de la séance en minutes (45-150)';
COMMENT ON COLUMN trainings.session_parts IS 'Organisation de la séance: [{"id": "string", "type": "Echauffement|Exercice|Situation|Jeu", "duration": number, "procedureId": "uuid|null"}]';
