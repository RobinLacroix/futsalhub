-- Soft delete for training_procedures: archived_at replaces hard DELETE
ALTER TABLE training_procedures ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
