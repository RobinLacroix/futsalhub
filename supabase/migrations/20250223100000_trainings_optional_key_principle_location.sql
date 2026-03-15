-- Rendre lieu et principe clé optionnels pour les entraînements
ALTER TABLE trainings
  ALTER COLUMN location DROP NOT NULL;

ALTER TABLE trainings
  ALTER COLUMN key_principle DROP NOT NULL;

COMMENT ON COLUMN trainings.location IS 'Lieu de la séance (optionnel)';
COMMENT ON COLUMN trainings.key_principle IS 'Principe clé de la séance (optionnel)';
