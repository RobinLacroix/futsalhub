-- ═════════════════════════════════════════════════════════════════════════════
-- Bug : un joueur pur (aucun rôle club_members) voit 0% d'assiduité sur "Ma
-- fiche joueur" alors que ses séances sont bien enregistrées (confirmé en
-- base, hors RLS, via claude_audit).
--
-- Cause : la policy SELECT de `player_teams` n'a jamais eu de clause
-- d'auto-accès joueur :
--   (club_id IS NOT NULL) AND has_club_access(club_id)
--
-- Plusieurs policies (dont "Users can view their club trainings", déjà en
-- place) tentent un self-check joueur via une sous-requête EXISTS brute sur
-- player_teams :
--   EXISTS (SELECT 1 FROM player_teams pt JOIN players p ON p.id = pt.player_id
--           WHERE pt.team_id = trainings.team_id AND p.user_id = auth.uid())
--
-- Une sous-requête écrite en dur dans une policy USING s'exécute avec les
-- droits de l'appelant, donc re-soumise aux RLS de player_teams. Sans clause
-- self sur player_teams, cette sous-requête ne voit jamais la ligne du joueur
-- quand c'est lui qui interroge : le EXISTS renvoie faux même si la ligne
-- existe réellement, et la clause censée le laisser passer ne joue jamais son
-- rôle. Contrairement à has_club_access()/has_player_access(), qui sont
-- SECURITY DEFINER et contournent RLS en interne, ces sous-requêtes brutes
-- restent piégées par RLS — c'est ce qui les rend invisibles à un audit fait
-- avec un rôle qui bypass RLS (claude_audit), la donnée paraît normale alors
-- que l'accès réel est bloqué.
--
-- Correctif : donner à player_teams la même clause self que `players` a déjà
-- (20250222100000_player_access_user_id_and_rpc.sql §2). Corrige du même coup
-- toute policy existante ou future qui dépend de player_teams pour un
-- self-check joueur, sans avoir à les toucher une par une.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view their club player_teams" ON player_teams;
CREATE POLICY "Users can view their club player_teams" ON player_teams
  FOR SELECT USING (
    (club_id IS NOT NULL AND has_club_access(club_id))
    OR EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_teams.player_id
        AND p.user_id = auth.uid()
    )
  );

-- Vérification.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_teams'
      AND policyname = 'Users can view their club player_teams'
      AND qual ILIKE '%p.user_id = auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'player_teams SELECT policy sans clause d''auto-accès joueur';
  END IF;
END $$;
