-- Migration pour rendre la colonne players optionnelle dans la table matches
-- Cela permettra de créer des matches sans joueurs

-- Modifier la contrainte NOT NULL sur la colonne players
ALTER TABLE matches 
ALTER COLUMN players DROP NOT NULL;

-- Ajouter une valeur par défaut (tableau vide) pour les nouvelles lignes
ALTER TABLE matches 
ALTER COLUMN players SET DEFAULT '[]'::jsonb;

-- Mettre à jour les lignes existantes qui ont NULL pour players
UPDATE matches 
SET players = '[]'::jsonb 
WHERE players IS NULL; 