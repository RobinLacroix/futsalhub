-- Ajouter une colonne pour stocker la limite de temps par séquence pour chaque joueur
ALTER TABLE players
ADD COLUMN IF NOT EXISTS sequence_time_limit INTEGER NOT NULL DEFAULT 180;

-- S'assurer que toutes les lignes existantes ont une valeur définie
UPDATE players
SET sequence_time_limit = 180
WHERE sequence_time_limit IS NULL;


