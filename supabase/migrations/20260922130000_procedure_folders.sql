-- ═════════════════════════════════════════════════════════════════════════════
-- training_procedures : les dossiers de rangement passent des schémas aux
-- procédés. Suite du recadrage 2026-09-22 avec Robin — une seule bibliothèque,
-- un seul format de carte (celui de l'éditeur), alimentée par les procédés
-- (chacun avec son schéma en vignette s'il en a un) plutôt que par les
-- schémas bruts. Les dossiers doivent donc organiser ce qu'on range vraiment :
-- des procédés.
--
-- Table `schematic_folders` réutilisée telle quelle (même club_id/team_id,
-- même RLS club-wide depuis 20260922100000) — pas renommée : elle continue
-- aussi de ranger des schémas sans fiche liée (cf "les deux cas existent").
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.training_procedures
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.schematic_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_training_procedures_folder_id ON public.training_procedures (folder_id);

-- Backfill : une fiche liée à un schéma déjà rangé hérite du même dossier,
-- pour ne pas perdre le rangement existant au moment de la bascule.
UPDATE public.training_procedures p
SET folder_id = s.folder_id
FROM public.schematics s
WHERE s.id = p.schematic_id AND s.folder_id IS NOT NULL AND p.folder_id IS NULL;

COMMIT;
