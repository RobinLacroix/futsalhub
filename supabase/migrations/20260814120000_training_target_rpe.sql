-- ═════════════════════════════════════════════════════════════════════════════
-- RPE cible de séance — piloter la charge planifiée, pas seulement la réalisée.
--
-- `trainings.session_duration` (20250116000000) et `training_player_feedback.rpe`
-- (déjà en base) donnent la charge RÉALISÉE, lue par get_training_load
-- (20260813160000). Il manquait la charge VISÉE au moment de la planification,
-- pour comparer plan et réalité — c'est tout l'intérêt du pilotage de charge.
--
-- Fourchette et non score exact : le RPE est une mesure perçue, une cible au
-- point près serait une fausse précision. Une séance se pense en zone
-- d'intensité (récup 2-4, aérobie 5-6, haute intensité 7-9), pas en chiffre
-- unique.
--
-- Aucune RPC : l'écriture passe par les mêmes chemins directs sur `trainings`
-- que session_duration (via calendar/page.tsx côté web, via
-- mobile/lib/services/trainings.ts côté mobile), déjà protégés par les policies
-- RLS existantes de la table. Pas de nouvelle surface d'accès à garder.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS target_rpe_min smallint,
  ADD COLUMN IF NOT EXISTS target_rpe_max smallint;

ALTER TABLE public.trainings DROP CONSTRAINT IF EXISTS trainings_target_rpe_min_range;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_target_rpe_min_range
  CHECK (target_rpe_min IS NULL OR target_rpe_min BETWEEN 1 AND 10);

ALTER TABLE public.trainings DROP CONSTRAINT IF EXISTS trainings_target_rpe_max_range;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_target_rpe_max_range
  CHECK (target_rpe_max IS NULL OR target_rpe_max BETWEEN 1 AND 10);

ALTER TABLE public.trainings DROP CONSTRAINT IF EXISTS trainings_target_rpe_order;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_target_rpe_order
  CHECK (target_rpe_min IS NULL OR target_rpe_max IS NULL OR target_rpe_min <= target_rpe_max);

COMMENT ON COLUMN public.trainings.target_rpe_min IS 'RPE cible, borne basse (1-10). Fourchette, jamais un score exact.';
COMMENT ON COLUMN public.trainings.target_rpe_max IS 'RPE cible, borne haute (1-10).';


-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainings' AND column_name = 'target_rpe_min'
  ) THEN
    RAISE EXCEPTION 'target_rpe_min absente apres migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainings' AND column_name = 'target_rpe_max'
  ) THEN
    RAISE EXCEPTION 'target_rpe_max absente apres migration';
  END IF;

  RAISE NOTICE 'target_rpe_min / target_rpe_max verifiees.';
END
$mig$;
