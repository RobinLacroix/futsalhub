-- Migration simplifiée pour le suivi des présences aux entraînements
-- Utilise un champ JSONB directement dans la table trainings

-- 1. Ajouter le champ attendance JSONB à la table trainings
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS attendance JSONB;

-- 2. Index pour optimiser les requêtes sur le champ JSONB
CREATE INDEX IF NOT EXISTS idx_trainings_attendance ON trainings USING GIN (attendance);

-- 3. Commentaire pour la documentation
COMMENT ON COLUMN trainings.attendance IS 'Statuts de présence des joueurs: {"player_id": "present|absent|injured"}';

-- 4. Exemple de données JSONB
-- {
--   "uuid-joueur-1": "present",
--   "uuid-joueur-2": "absent",
--   "uuid-joueur-3": "injured"
-- }

-- 5. Requêtes utiles pour analyser les présences

-- Compter les présences par statut pour un entraînement
-- SELECT 
--   jsonb_object_keys(attendance) as player_id,
--   attendance->jsonb_object_keys(attendance) as status
-- FROM trainings 
-- WHERE id = 'training-uuid';

-- Compter les présences par statut pour tous les entraînements
-- SELECT 
--   theme,
--   date,
--   jsonb_object_keys(attendance) as player_id,
--   attendance->jsonb_object_keys(attendance) as status
-- FROM trainings 
-- WHERE attendance IS NOT NULL;

-- Statistiques par joueur (exemple)
-- SELECT 
--   p.first_name,
--   p.last_name,
--   COUNT(*) as total_sessions,
--   COUNT(CASE WHEN t.attendance->p.id::text = '"present"' THEN 1 END) as present_count,
--   COUNT(CASE WHEN t.attendance->p.id::text = '"absent"' THEN 1 END) as absent_count,
--   COUNT(CASE WHEN t.attendance->p.id::text = '"injured"' THEN 1 END) as injured_count
-- FROM players p
-- CROSS JOIN trainings t
-- WHERE t.attendance IS NOT NULL
-- GROUP BY p.id, p.first_name, p.last_name;
