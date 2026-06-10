-- Replace raw age integer with birth_date for accurate age calculation
ALTER TABLE players ADD COLUMN IF NOT EXISTS birth_date DATE NULL;
