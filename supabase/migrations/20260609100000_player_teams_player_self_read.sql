-- Les politiques RLS sur shared_content et shared_content_folders vérifient l'accès
-- joueur via un EXISTS sur player_teams. Mais player_teams n'a qu'une politique
-- has_club_access (coachs/admins uniquement) : les joueurs ne pouvaient pas y accéder,
-- bloquant silencieusement tout accès au contenu partagé côté joueur.
--
-- Fix : permettre à un joueur de lire ses propres lignes dans player_teams.

CREATE POLICY "player_teams_player_read_own" ON public.player_teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_teams.player_id
        AND p.user_id = auth.uid()
    )
  );
