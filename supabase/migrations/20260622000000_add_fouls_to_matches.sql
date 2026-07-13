-- Ajout des colonnes de fautes par mi-temps sur la table matches.
-- Ces colonnes sont persistées par le match recorder mobile pour éviter la perte
-- du comptage en cas de kill de l'app ou de changement de mi-temps.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS fouls_team integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fouls_opponent integer NOT NULL DEFAULT 0;
