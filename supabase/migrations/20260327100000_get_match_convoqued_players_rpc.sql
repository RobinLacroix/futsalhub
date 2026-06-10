-- Fiches joueurs pour l’enregistrement de match : tous les convoqués (matches.players),
-- même si la RLS sur players les masquerait (ex. sans player_teams / team_id club).
-- Autorisé seulement si l’utilisateur a déjà accès au match (même club).

CREATE OR REPLACE FUNCTION get_match_convoqued_players(p_match_id UUID)
RETURNS SETOF players
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_players JSONB;
BEGIN
  SELECT m.players INTO v_players
  FROM matches m
  JOIN teams t ON t.id = m.team_id
  WHERE m.id = p_match_id
    AND t.club_id IS NOT NULL
    AND has_club_access(t.club_id);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM (
    SELECT DISTINCT ON ((j.elem ->> 'id')::uuid) (j.elem ->> 'id')::uuid AS pid, j.ord
    FROM jsonb_array_elements(COALESCE(v_players, '[]'::jsonb)) WITH ORDINALITY AS j(elem, ord)
    WHERE j.elem ->> 'id' IS NOT NULL
    ORDER BY (j.elem ->> 'id')::uuid, j.ord
  ) x
  INNER JOIN players p ON p.id = x.pid
  ORDER BY x.ord;
END;
$$;

COMMENT ON FUNCTION get_match_convoqued_players(UUID) IS
  'Joueurs convoqués (ordre matches.players), pour match recorder ; bypass RLS lecture ciblée.';

REVOKE ALL ON FUNCTION get_match_convoqued_players(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_match_convoqued_players(UUID) TO authenticated;
