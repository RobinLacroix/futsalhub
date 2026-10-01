-- ═════════════════════════════════════════════════════════════════════════════
-- Bug : un joueur sans rôle staff (pas de ligne club_members) ne voit pas ses
-- stats sur "Ma fiche joueur", alors qu'un joueur ayant AUSSI un profil coach
-- les voit.
--
-- Cause confirmée en base (pg_policies) : les policies SELECT sur `matches` et
-- `match_events` ne testent que has_club_access(club_id), qui n'interroge que
-- club_members (rôles admin/coach/viewer/medical). Elles n'ont aucune clause
-- d'auto-accès joueur. `players/profile/page.tsx` (getPlayerStats,
-- getPlayerRadarStats) lit directement `matches` et `match_events` filtrés par
-- team_id : un joueur pur (aucune ligne club_members) se voit donc renvoyer un
-- résultat vide sur ces deux tables, faute de policy qui matche.
--
-- `trainings` avait déjà été corrigée dans ce sens (has_club_access OR
-- player_teams/players.user_id) — cette migration applique le même pattern à
-- `matches` et `match_events`, qui exposent tous les deux team_id.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view their club matches" ON matches;
CREATE POLICY "Users can view their club matches" ON matches
  FOR SELECT USING (
    (club_id IS NOT NULL AND has_club_access(club_id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players p ON p.id = pt.player_id
      WHERE pt.team_id = matches.team_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM players p
      WHERE p.team_id = matches.team_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view their club match_events" ON match_events;
CREATE POLICY "Users can view their club match_events" ON match_events
  FOR SELECT USING (
    (club_id IS NOT NULL AND has_club_access(club_id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players p ON p.id = pt.player_id
      WHERE pt.team_id = match_events.team_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM players p
      WHERE p.team_id = match_events.team_id
        AND p.user_id = auth.uid()
    )
  );

-- Vérification : les deux policies existent bien avec la clause d'auto-accès.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches'
      AND policyname = 'Users can view their club matches'
      AND qual ILIKE '%p.user_id = auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'matches SELECT policy sans clause d''auto-accès joueur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'match_events'
      AND policyname = 'Users can view their club match_events'
      AND qual ILIKE '%p.user_id = auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'match_events SELECT policy sans clause d''auto-accès joueur';
  END IF;
END $$;
