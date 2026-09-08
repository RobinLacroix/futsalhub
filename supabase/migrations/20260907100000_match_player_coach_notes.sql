-- Système d'évaluation de match — Volet C (note staff, subjective, par joueur).
-- Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
--
-- Note /10 (pas de 0.5) saisie à la main par le coach, par joueur ayant joué, par match.
-- Contrairement au Volet A (matches.coach_evaluation) et au Volet B (calculée, visible
-- joueur), cette note est STRICTEMENT STAFF-ONLY : aucune policy de lecture joueur,
-- table dédiée (pattern pain_reports) plutôt qu'une colonne sur matches, qui reste
-- lisible dès has_club_access (viewer inclus, et potentiellement le joueur via une
-- future RPC qui exposerait matches côté joueur).
--
-- Une seule note par (match, joueur), partagée pour tout le staff du club (pas de
-- note par coach) : cohérent avec le principe déjà acté sur match_rating_weights
-- (échelle scopée club, pas utilisateur), pour garder une donnée cohérente pour
-- tout le staff. Le dernier coach à modifier écrase la valeur précédente.

CREATE TABLE IF NOT EXISTS public.match_player_coach_notes (
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note        NUMERIC(3,1) NOT NULL CHECK (
    note BETWEEN 0.5 AND 10.0 AND note = ROUND(note * 2) / 2.0
  ),
  updated_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_player_coach_notes_player ON public.match_player_coach_notes(player_id);

COMMENT ON TABLE public.match_player_coach_notes IS
  'Volet C : note staff /10 par joueur et par match, saisie manuelle coach. Strictement staff-only (aucune policy de lecture joueur). Voir SPEC_EVALUATION_MATCH_2026-07.md.';

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.match_player_coach_notes ENABLE ROW LEVEL SECURITY;

-- Lecture : staff des équipes du joueur (has_player_access inclut le rôle viewer,
-- cohérent avec le pattern pain_reports — c'est une garde de LECTURE).
DROP POLICY IF EXISTS "Staff can view match_player_coach_notes" ON public.match_player_coach_notes;
CREATE POLICY "Staff can view match_player_coach_notes" ON public.match_player_coach_notes
  FOR SELECT USING (has_player_access(player_id));

-- Écriture : team-scoped via has_team_write_access (exclut viewer), même schéma
-- que match_events (20260730100000) — le joueur n'a AUCUNE policy, sur aucune
-- opération : c'est ce qui garantit l'invisibilité stricte.
DROP POLICY IF EXISTS "Staff can insert match_player_coach_notes" ON public.match_player_coach_notes;
CREATE POLICY "Staff can insert match_player_coach_notes" ON public.match_player_coach_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
      WHERE m.id = match_player_coach_notes.match_id AND has_team_write_access(t.id)
    )
  );

DROP POLICY IF EXISTS "Staff can update match_player_coach_notes" ON public.match_player_coach_notes;
CREATE POLICY "Staff can update match_player_coach_notes" ON public.match_player_coach_notes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
      WHERE m.id = match_player_coach_notes.match_id AND has_team_write_access(t.id)
    )
  );

DROP POLICY IF EXISTS "Staff can delete match_player_coach_notes" ON public.match_player_coach_notes;
CREATE POLICY "Staff can delete match_player_coach_notes" ON public.match_player_coach_notes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
      WHERE m.id = match_player_coach_notes.match_id AND has_team_write_access(t.id)
    )
  );

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Table neuve : aucun GRANT n'existe encore vers PUBLIC par défaut (contrairement
-- aux fonctions, où PUBLIC a EXECUTE par défaut — cf. règle §1 CLAUDE.md). RLS
-- fait le reste : SELECT/INSERT/UPDATE/DELETE ci-dessus restent scopés staff.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_player_coach_notes TO authenticated;

-- ── Vérification ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_player_coach_notes'
      AND qual ILIKE '%players.user_id%'
  ) THEN
    RAISE EXCEPTION 'match_player_coach_notes : une policy référence players.user_id — la note ne serait plus strictement staff-only';
  END IF;
END $$;
