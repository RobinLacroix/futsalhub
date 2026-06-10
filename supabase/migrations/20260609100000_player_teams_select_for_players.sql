-- Les joueurs ne pouvaient pas lire player_teams, ce qui bloquait les sous-requêtes
-- dans les politiques RLS de shared_content et shared_content_folders.
-- On ajoute une politique SELECT permettant à un joueur de voir ses propres lignes.

CREATE POLICY "Players can view their own player_teams"
  ON public.player_teams
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_teams.player_id
        AND p.user_id = auth.uid()
    )
  );
