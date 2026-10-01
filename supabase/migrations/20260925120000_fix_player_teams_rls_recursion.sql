-- ═════════════════════════════════════════════════════════════════════════════
-- INCIDENT : plus aucune donnée visible (joueurs, matchs, entraînements...)
-- juste après 20260925110000_player_teams_self_access.sql.
--
-- Cause : récursion mutuelle entre les policies SELECT de `player_teams` et
-- `players`.
--
--   player_teams (après 20260925110000) :
--     ... OR EXISTS (SELECT 1 FROM players p WHERE p.id = player_teams.player_id
--                      AND p.user_id = auth.uid())
--
--   players (déjà en place depuis 20250222100000) :
--     ... OR EXISTS (SELECT 1 FROM player_teams pt JOIN teams t ON t.id = pt.team_id
--                      WHERE pt.player_id = players.id AND has_club_access(t.club_id))
--
-- Une sous-requête écrite en dur dans un USING s'exécute avec les droits de
-- l'appelant, donc re-déclenche la RLS de la table qu'elle touche. Lire
-- player_teams déclenche la RLS de players, qui redéclenche celle de
-- player_teams, qui redéclenche celle de players... Contrairement à
-- has_club_access()/has_team_access()/has_player_access(), qui sont
-- SECURITY DEFINER et contournent RLS en interne (pas de récursion possible),
-- la sous-requête brute ajoutée dans 20260925110000 n'avait pas cette
-- protection. Toute requête touchant players ou player_teams en a payé le
-- prix, d'où l'écran vide généralisé.
--
-- Correctif : passer par une fonction SECURITY DEFINER pour le self-check,
-- comme le reste du fichier de permissions. Elle lit players sans repasser
-- par sa RLS, donc plus de cycle.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_own_player(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM players p
    WHERE p.id = p_player_id
      AND p.user_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION is_own_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_own_player(UUID) TO authenticated;

COMMENT ON FUNCTION is_own_player(UUID) IS
  'Le joueur connecté est-il le propriétaire de cette fiche players ? SECURITY DEFINER : contourne la RLS de players en interne, pour éviter toute récursion avec les policies qui la référencent (cf. incident 2026-09-25, 20260925110000).';

DROP POLICY IF EXISTS "Users can view their club player_teams" ON player_teams;
CREATE POLICY "Users can view their club player_teams" ON player_teams
  FOR SELECT USING (
    (club_id IS NOT NULL AND has_club_access(club_id))
    OR is_own_player(player_id)
  );

-- Vérification : plus aucune sous-requête brute sur players dans la policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_teams'
      AND policyname = 'Users can view their club player_teams'
      AND qual ILIKE '%FROM players%'
  ) THEN
    RAISE EXCEPTION 'player_teams SELECT policy contient encore une sous-requête brute sur players';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_teams'
      AND policyname = 'Users can view their club player_teams'
      AND qual ILIKE '%is_own_player%'
  ) THEN
    RAISE EXCEPTION 'player_teams SELECT policy sans is_own_player()';
  END IF;
END $$;
