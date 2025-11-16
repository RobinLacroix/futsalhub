-- Create enum types for training procedures metadata
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_theme') THEN
    CREATE TYPE training_theme AS ENUM ('Offensif', 'Defensif', 'Transition', 'CPA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_type') THEN
    CREATE TYPE training_type AS ENUM ('Echauffement', 'Exercice', 'Situation', 'Jeu');
  END IF;
END
$$;

-- Create table to store training procedures
CREATE TABLE IF NOT EXISTS training_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  title text NOT NULL,
  objectives text NOT NULL,
  instructions text NOT NULL,
  variants text,
  corrections text,

  theme training_theme NOT NULL,
  type training_type NOT NULL,

  min_players integer CHECK (min_players IS NULL OR min_players >= 0),
  field_dimensions text,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  image_url text
);

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_training_procedures_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_training_procedures_updated_at ON training_procedures;
CREATE TRIGGER trg_training_procedures_updated_at
BEFORE UPDATE ON training_procedures
FOR EACH ROW
EXECUTE FUNCTION set_training_procedures_updated_at();

-- RLS configuration
ALTER TABLE training_procedures ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read the library
CREATE POLICY training_procedures_read_policy
  ON training_procedures
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to manage procedures (adjust as needed)
CREATE POLICY training_procedures_write_policy
  ON training_procedures
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);





