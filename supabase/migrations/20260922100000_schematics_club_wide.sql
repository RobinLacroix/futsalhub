-- ═════════════════════════════════════════════════════════════════════════════
-- schematics / schematic_folders : bibliothèque de schémas tactiques passe de
-- portée équipe à portée club. Demande de Robin : un schéma créé par une
-- équipe doit être visible par tout le club (comme training_procedures/
-- training_sessions, déjà club_id-scopés), mais on garde `team_id` comme
-- étiquette "créée par" — affichable et filtrable côté webapp et mobile, pas
-- juste un vestige.
--
-- Écriture : reste scopée équipe (has_team_write_access(team_id)), pas club
-- (has_club_write_access). Robin n'a demandé que la visibilité en lecture ;
-- élargir aussi l'écriture donnerait à n'importe quel coach du club le droit
-- de modifier/supprimer les schémas d'une autre équipe — pas demandé, pas
-- fait par réflexe (cf CLAUDE.md, "ne pas migrer par réflexe").
--
-- club_id dérivé de team_id par trigger (jamais fourni par le client) : le
-- code web/mobile qui écrit un schéma n'a rien à changer pour rester correct.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Colonne club_id sur les deux tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.schematics
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id);

ALTER TABLE public.schematic_folders
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Backfill depuis teams.club_id
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.schematics s
SET club_id = t.club_id
FROM public.teams t
WHERE t.id = s.team_id AND s.club_id IS NULL;

UPDATE public.schematic_folders f
SET club_id = t.club_id
FROM public.teams t
WHERE t.id = f.team_id AND f.club_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Vérification — un schematics/schematic_folders dont l'équipe n'a pas
-- (ou plus) de club bloque la migration plutôt que de laisser une ligne
-- club_id NULL passer en silence (cf CLAUDE.md, contrôle qui interroge le
-- catalogue plutôt qu'une relecture de code).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_orphan_schematics integer;
  v_orphan_folders integer;
BEGIN
  SELECT count(*) INTO v_orphan_schematics FROM public.schematics WHERE club_id IS NULL;
  SELECT count(*) INTO v_orphan_folders FROM public.schematic_folders WHERE club_id IS NULL;

  IF v_orphan_schematics > 0 OR v_orphan_folders > 0 THEN
    RAISE EXCEPTION
      'schematics_club_wide: % schema(s) et % dossier(s) sans club_id apres backfill (team_id orphelin ?) — migration annulee',
      v_orphan_schematics, v_orphan_folders;
  END IF;
END $$;

ALTER TABLE public.schematics ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.schematic_folders ALTER COLUMN club_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schematics_club_id ON public.schematics (club_id);
CREATE INDEX IF NOT EXISTS idx_schematic_folders_club_id ON public.schematic_folders (club_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. club_id toujours dérivé de team_id, jamais saisi côté client
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_club_id_from_team_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.teams WHERE id = NEW.team_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'sync_club_id_from_team_id: equipe % introuvable ou sans club', NEW.team_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_club_id_from_team_id() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_schematics_sync_club_id ON public.schematics;
CREATE TRIGGER trg_schematics_sync_club_id
  BEFORE INSERT OR UPDATE OF team_id ON public.schematics
  FOR EACH ROW EXECUTE FUNCTION public.sync_club_id_from_team_id();

DROP TRIGGER IF EXISTS trg_schematic_folders_sync_club_id ON public.schematic_folders;
CREATE TRIGGER trg_schematic_folders_sync_club_id
  BEFORE INSERT OR UPDATE OF team_id ON public.schematic_folders
  FOR EACH ROW EXECUTE FUNCTION public.sync_club_id_from_team_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. RLS — lecture club-wide, ecriture inchangee (toujours team-scopee)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS schematics_select ON public.schematics;
CREATE POLICY schematics_select
  ON public.schematics FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));

DROP POLICY IF EXISTS schematic_folders_select ON public.schematic_folders;
CREATE POLICY schematic_folders_select
  ON public.schematic_folders FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- §6. Durcissement sans effet fonctionnel : schematics portait encore un
-- grant anon historique (cf 20260921110000, deja signale comme "inoffensif"
-- puisque has_team_access/has_club_access renvoient FALSE pour auth.uid()
-- NULL) — retire puisqu'on touche deja les policies de cette table.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.schematics FROM anon;

COMMIT;
