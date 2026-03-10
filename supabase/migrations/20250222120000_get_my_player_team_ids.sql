-- RPC : retourne les team_id des équipes du joueur connecté (pour afficher les stats sur "Ma fiche")
CREATE OR REPLACE FUNCTION get_my_player_team_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pt.team_id
  FROM player_teams pt
  WHERE pt.player_id = v_player_id;
END;
$$;

COMMENT ON FUNCTION get_my_player_team_ids() IS 'Joueur connecté : liste des équipes auxquelles il appartient (pour Ma fiche / stats)';
