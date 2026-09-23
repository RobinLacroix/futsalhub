-- ═════════════════════════════════════════════════════════════════════════════
-- training_procedures : optimisation des champs de la fiche procédé, décidée
-- avec Robin (recadrage 2026-09-22) — deux taxonomies restent séparées
-- (bloc pédagogique / format), le champ `theme` legacy devient "Phase de jeu"
-- (+ Powerplay), l'ancien `phase` (1/2/Mix, phase d'apprentissage) sort des
-- formulaires sans être supprimé (pas de perte de donnée sur les fiches
-- existantes), et deux champs manquants d'après la doctrine du coach
-- (question de débriefing, niveau d'intensité) sont ajoutés. `principe`
-- (texte unique) devient `principes` (tags multiples) — pas de liste figée en
-- base : les valeurs émergent des fiches, comme les thèmes de schematics
-- (cf 20260922100000).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Format : ajoute "Rondo/Toro" à l'enum existant plutôt qu'une colonne de
-- plus — c'est exactement le même axe (Echauffement/Exercice/Situation/Jeu)
-- avec une valeur en plus, pas un nouveau concept.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.training_type ADD VALUE IF NOT EXISTS 'Rondo/Toro';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Phase de jeu : ajoute "Powerplay" à l'enum `theme` existant. Le champ
-- s'appelle toujours `theme` en base (renommer la colonne casserait la
-- compat avec les fiches existantes sans bénéfice réel), mais l'UI web/mobile
-- l'affiche désormais comme "Phase de jeu".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.training_theme ADD VALUE IF NOT EXISTS 'Powerplay';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Principes associés : texte unique -> tags multiples. Colonne `principe`
-- conservée telle quelle (pas de perte de donnée), `principes` prend le relai
-- pour les nouvelles fiches et absorbe la valeur existante par défaut.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_procedures
  ADD COLUMN IF NOT EXISTS principes text[] NOT NULL DEFAULT '{}';

UPDATE public.training_procedures
SET principes = ARRAY[principe]
WHERE principe IS NOT NULL AND btrim(principe) <> '' AND principes = '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Champs manquants d'après la doctrine du coach (skill futsal-coach) :
-- question de débriefing (Blocs 2/5, "le jeu enseigne, le coach questionne")
-- et niveau d'intensité (aligné sur le vocabulaire du plan hebdomadaire du
-- coach : Légère / Modérée / Haute — pas de CHECK, même convention que les
-- autres champs texte libres ajoutés hors migration jusqu'ici : bloc,
-- principe, phase, rapport_numerique).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_procedures
  ADD COLUMN IF NOT EXISTS question_debriefing text,
  ADD COLUMN IF NOT EXISTS intensite text;

COMMIT;
