-- ═════════════════════════════════════════════════════════════════════════════
-- training_sessions : bibliothèque de séances réutilisables (Phase 2 de
-- l'intégration éditeur tactique, cf. livrables/futsalhub/
-- SPEC_ASSEMBLEUR_SEANCE_PHASE2_2026-09.md).
--
-- Remplace le concept `trainings.session_parts` (JSONB inline, non réutilisable,
-- cf. migration 20250116000000) par des séances autonomes, partagées au niveau
-- club (comme training_procedures qu'elles assemblent), référencées par les
-- trainings via une simple FK (`trainings.session_id`, ajoutée en fin de
-- fichier). `trainings.session_parts`/`session_duration` restent en place —
-- non supprimées ici, migration des données existantes traitée à part
-- (script one-shot, étape 7 du plan).
--
-- Portée club (pas équipe) : décision actée en brainstorming, cohérente avec
-- training_procedures que les blocs d'une séance référencent.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name       text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocks     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_sessions IS
  'Séance réutilisable assemblée depuis des training_procedures. meta = {theme, tags, dureeTotaleMin, objectif}. blocks = [{id, type, duration, procedureId, intentionPedagogique}], type reprend l''enum training_type.';
COMMENT ON COLUMN public.training_sessions.club_id IS
  'Club propriétaire — porte l''isolation, comme training_procedures.club_id.';
COMMENT ON COLUMN public.training_sessions.blocks IS
  'Liste libre de blocs (pas de trame imposée). Chaque bloc référence optionnellement une training_procedures.id — la FK n''est pas déclarée en SQL (jsonb), à valider côté application.';

CREATE INDEX IF NOT EXISTS idx_training_sessions_club_id ON public.training_sessions (club_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Remplissage automatique du club propriétaire (même patron que
-- training_procedures_fill_ownership, 20260813100000_training_procedures_
-- ownership.sql §3) — filet si le client omet club_id à l'insert.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.training_sessions_fill_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT count(DISTINCT club_id) INTO v_count
      FROM public.club_members
     WHERE user_id = auth.uid() AND role IN ('admin', 'coach');

    IF v_count = 0 THEN
      RAISE EXCEPTION 'Aucun club en ecriture pour cet utilisateur : impossible de creer une seance.'
        USING ERRCODE = '42501';
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'Utilisateur rattache a % clubs : preciser club_id a la creation de la seance.', v_count
        USING ERRCODE = '22023';
    END IF;

    SELECT DISTINCT club_id INTO NEW.club_id
      FROM public.club_members
     WHERE user_id = auth.uid() AND role IN ('admin', 'coach');
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_sessions_fill_ownership_trg ON public.training_sessions;
CREATE TRIGGER training_sessions_fill_ownership_trg
  BEFORE INSERT ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.training_sessions_fill_ownership();

-- updated_at : réutilise la fonction générique déjà en place pour schematics
-- (20260803xxxxxx, cf. update_schematics_updated_at), pas de nouvelle fonction.
DROP TRIGGER IF EXISTS trg_training_sessions_updated_at ON public.training_sessions;
CREATE TRIGGER trg_training_sessions_updated_at
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Privilèges de table — strict nécessaire, pas de défaut Supabase pour anon.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.training_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.training_sessions FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_sessions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Policies — même patron que training_procedures (§5 de sa migration) :
-- lecture et écriture scopées club, pas de catalogue public ni de lien de
-- partage (aucun besoin exprimé pour les séances).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_sessions_select_own_club
  ON public.training_sessions FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));

CREATE POLICY training_sessions_insert
  ON public.training_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access(club_id));

CREATE POLICY training_sessions_update
  ON public.training_sessions FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));

CREATE POLICY training_sessions_delete
  ON public.training_sessions FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. Lien depuis trainings — additive, ne touche pas session_parts/
-- session_duration (conservées jusqu'à validation en conditions réelles,
-- cf. spec §8).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trainings.session_id IS
  'Référence vivante vers training_sessions — remplace progressivement session_parts/session_duration (Phase 2). Modifier la séance master impacte tous les trainings qui la référencent.';

CREATE INDEX IF NOT EXISTS idx_trainings_session_id ON public.trainings (session_id);

COMMIT;
