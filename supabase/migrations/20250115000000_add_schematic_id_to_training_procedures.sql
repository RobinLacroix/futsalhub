-- Add schematic_id column to training_procedures table
ALTER TABLE training_procedures
ADD COLUMN IF NOT EXISTS schematic_id uuid REFERENCES schematics(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_training_procedures_schematic_id ON training_procedures(schematic_id);


