-- ═════════════════════════════════════════════════════════════════════════════
-- Autoriser le thème 'CPA' sur trainings.theme
--
-- Le type TS `TrainingTheme` (types/index.ts) propose déjà 'CPA' et 'Defensif'
-- (sans accent) au choix, mais `trainings_theme_check` ne les a jamais
-- acceptés — seuls 'Offensif', 'Défensif', 'Transition', 'Supériorité'
-- passaient. Une création de séance avec 'CPA' échoue donc en base avec
-- `violates check constraint "trainings_theme_check"` (rencontré en pratique
-- en peuplant des séances de test).
--
-- Cette migration ajoute 'CPA' à la liste autorisée. Elle ne touche PAS
-- 'Defensif' sans accent : personne ne l'a demandé, et le retirer du type TS
-- serait le bon correctif le jour où quelqu'un s'en occupe — pas ici, pas en
-- silence dans une migration de contrainte.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trainings DROP CONSTRAINT IF EXISTS trainings_theme_check;

ALTER TABLE public.trainings ADD CONSTRAINT trainings_theme_check
  CHECK (theme = ANY (ARRAY['Offensif'::text, 'Défensif'::text, 'Transition'::text, 'Supériorité'::text, 'CPA'::text]));

-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'trainings_theme_check' AND conrelid = 'public.trainings'::regclass;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'trainings_theme_check absente apres migration';
  END IF;

  IF v_def NOT LIKE '%CPA%' THEN
    RAISE EXCEPTION 'trainings_theme_check n''autorise pas CPA apres migration : %', v_def;
  END IF;

  RAISE NOTICE 'trainings_theme_check verifiee : %', v_def;
END
$mig$;
