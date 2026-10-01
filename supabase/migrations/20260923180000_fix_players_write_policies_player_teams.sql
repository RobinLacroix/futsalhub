-- ─────────────────────────────────────────────────────────────────────────────
-- Fix : admin ET coach ne peuvent pas modifier certains joueurs.
--
-- Root cause : les policies INSERT/UPDATE/DELETE sur `players` (posées par
-- 20260730100000_access_write_team_scoped.sql) ne résolvent l'accès écriture
-- QUE via players.team_id :
--
--   EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
--
-- Or un joueur peut être rattaché à une équipe de deux façons (modèle de
-- données réel, cf. playersService.createPlayer / updatePlayer) :
--   1. players.team_id      -- équipe "primaire" (selectedTeams[0])
--   2. player_teams         -- table de jonction, TOUTES les équipes sélectionnées
--
-- Pour un joueur multi-équipes, team_id ne pointe QUE sur la première équipe
-- sélectionnée. Un coach rattaché à une équipe secondaire du joueur (via
-- player_teams uniquement) échoue le EXISTS ci-dessus -> refusé. Si team_id
-- est NULL ou périmé (équipe primaire supprimée/réassignée), le EXISTS échoue
-- pour TOUT LE MONDE, y compris l'admin du club, puisque le rôle n'est même
-- pas évalué : la jointure sur teams échoue avant.
--
-- C'est exactement le bug déjà corrigé côté LECTURE par le §7 de
-- 20260803100000_rpc_security_hardening_v2.sql (has_player_access ignorait
-- player_teams) : même défaut de modèle, jamais reporté sur les policies RLS
-- de la table players elle-même. La policy SELECT ("Users can view their club
-- players") vérifie déjà les deux chemins, ce qui explique pourquoi le joueur
-- reste VISIBLE alors que l'écriture échoue silencieusement.
--
-- Correctif : aligner INSERT/UPDATE/DELETE sur le même double chemin que
-- SELECT et que has_player_access, en écriture (has_team_write_access, pas
-- has_team_access).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert players in their team" ON players;
DROP POLICY IF EXISTS "Users can update their team players"    ON players;
DROP POLICY IF EXISTS "Users can delete their team players"    ON players;

CREATE POLICY "Users can insert players in their team" ON players
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      WHERE pt.player_id = players.id AND has_team_write_access(pt.team_id)
    )
  );

CREATE POLICY "Users can update their team players" ON players
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      WHERE pt.player_id = players.id AND has_team_write_access(pt.team_id)
    )
  );

CREATE POLICY "Users can delete their team players" ON players
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      WHERE pt.player_id = players.id AND has_team_write_access(pt.team_id)
    )
  );

-- ── Garde-fou : vérifier que les 3 policies existent bien avec le double chemin ──
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(expected.policyname, ', ') INTO v_missing
  FROM (VALUES
    ('Users can insert players in their team'),
    ('Users can update their team players'),
    ('Users can delete their team players')
  ) AS expected(policyname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = 'players'
      AND p.policyname = expected.policyname
      AND (COALESCE(p.qual, '') || COALESCE(p.with_check, '')) LIKE '%player_teams%'
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Policies players toujours sans fallback player_teams : %', v_missing;
  END IF;
END $$;
