-- Ajouter la colonne number à la table players
ALTER TABLE players ADD COLUMN number INTEGER;

-- Ajouter un index pour optimiser les requêtes par numéro
CREATE INDEX idx_players_number ON players(number);

-- Ajouter une contrainte pour s'assurer que le numéro est unique par équipe
-- (optionnel, à décommenter si vous voulez cette contrainte)
-- ALTER TABLE players ADD CONSTRAINT unique_player_number UNIQUE (number); 