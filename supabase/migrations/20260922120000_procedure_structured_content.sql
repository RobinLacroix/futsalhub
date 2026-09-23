-- ═════════════════════════════════════════════════════════════════════════════
-- training_procedures : absorbe les champs structurés du panneau "Séance &
-- données" de l'éditeur tactique (public/tools/tactics/index.html), jusqu'ici
-- écrits dans schematics.data.rules / .meta — complètement déconnectés de la
-- fiche procédé (constat de Robin : "j'ai l'impression d'avoir deux bases de
-- données"). Décision : le panneau éditeur devient la référence structurelle
-- (scoring/comportements/mécanismes/variables en listes, pas du texte libre).
--
-- Ce que ça remplace : `corrections` (comportements attendus) et `variants`
-- (variantes) restent en base pour compat lecture des fiches existantes, mais
-- sortent des formulaires au profit de `comportements`/`variables_plus`/
-- `variables_moins`, plus fins.
--
-- Ce qui NE bouge PAS : schematics.data.meta (category/subcategory/theme) et
-- .rules (mecanismes/scoring/etc. déjà écrits par des schémas existants)
-- restent tels quels sur les schémas eux-mêmes — un schéma peut exister sans
-- fiche liée (croquis tactique pur, cf conversation), auquel cas ces champs
-- servent uniquement au filtrage de la bibliothèque de schémas. Seule la
-- lecture/écriture côté éditeur change : quand un schéma a une fiche liée
-- (training_procedures.schematic_id), le panneau édite désormais cette fiche
-- au lieu du JSON du schéma.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.training_procedures
  ADD COLUMN IF NOT EXISTS scoring text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comportements text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mecanismes jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS variables_plus text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS variables_moins text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS phase_cible text;

-- Backfill best-effort depuis les colonnes texte libre existantes : une ligne
-- par paragraphe non vide, pour ne pas perdre le contenu déjà saisi tel quel.
-- Best-effort assumé (un paragraphe de "corrections" n'est pas structuré de
-- la même façon qu'une liste de comportements) — Robin retouchera à la main
-- les fiches importantes, mais rien n'est supprimé (corrections/variants
-- restent en base, cf ci-dessus).
UPDATE public.training_procedures
SET comportements = string_to_array(btrim(corrections), E'\n')
WHERE corrections IS NOT NULL AND btrim(corrections) <> '' AND comportements = '{}';

UPDATE public.training_procedures
SET variables_plus = string_to_array(btrim(variants), E'\n')
WHERE variants IS NOT NULL AND btrim(variants) <> '' AND variables_plus = '{}';

-- mecanismes : structure {regle, induit} — un simple split ligne à ligne ne
-- peut pas deviner la coupure regle/induit, donc pas de backfill automatique
-- depuis `instructions` (texte libre). Les fiches existantes gardent leurs
-- règles dans `instructions`, à répartir à la main si besoin.

COMMIT;
