-- ═════════════════════════════════════════════════════════════════════════════
-- schematic_folders : dossiers de rangement de la bibliothèque de schémas
-- tactiques, par équipe. Transpose côté webapp le rangement en dossiers que
-- l'outil standalone (generateur-schemas/editor, DrillStore local) offrait
-- déjà — demande de Robin après la Phase 2 (assembleur de séance), pour
-- retrouver le même confort de bibliothèque dans l'éditeur embarqué.
--
-- Portée équipe (pas club) : cohérent avec `schematics` elle-même, qui est
-- déjà scopée par team_id, pas club_id (contrairement à training_procedures/
-- training_sessions).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schematic_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.schematic_folders IS
  'Dossiers de rangement de la bibliothèque de schémas tactiques (schematics), par équipe. Supprimer un dossier NE supprime PAS les schémas qu''il contient (schematics.folder_id repasse à NULL, cf ON DELETE SET NULL) — même comportement que DrillStore.deleteFolder côté standalone.';

CREATE INDEX IF NOT EXISTS idx_schematic_folders_team_id ON public.schematic_folders (team_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Privilèges et policies — convention actuelle (training_sessions,
-- 20260921100000) : authenticated uniquement, pas de grant anon par défaut
-- (contrairement à `schematics` elle-même, qui porte un grant anon plus
-- ancien mais fonctionnellement inoffensif — has_team_access renvoie FALSE
-- pour auth.uid() NULL. Pas repris ici : nouvelle table, convention la plus
-- stricte).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.schematic_folders FROM PUBLIC;
REVOKE ALL ON TABLE public.schematic_folders FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.schematic_folders TO authenticated;

ALTER TABLE public.schematic_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY schematic_folders_select
  ON public.schematic_folders FOR SELECT TO authenticated
  USING (public.has_team_access(team_id));

CREATE POLICY schematic_folders_insert
  ON public.schematic_folders FOR INSERT TO authenticated
  WITH CHECK (public.has_team_write_access(team_id));

CREATE POLICY schematic_folders_update
  ON public.schematic_folders FOR UPDATE TO authenticated
  USING      (public.has_team_write_access(team_id))
  WITH CHECK (public.has_team_write_access(team_id));

CREATE POLICY schematic_folders_delete
  ON public.schematic_folders FOR DELETE TO authenticated
  USING (public.has_team_write_access(team_id));

DROP TRIGGER IF EXISTS trg_schematic_folders_updated_at ON public.schematic_folders;
CREATE TRIGGER trg_schematic_folders_updated_at
  BEFORE UPDATE ON public.schematic_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Lien depuis schematics — additive, nullable (un schéma sans dossier
-- reste valide, "Sans dossier" dans l'UI).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.schematics
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.schematic_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schematics_folder_id ON public.schematics (folder_id);

COMMIT;
