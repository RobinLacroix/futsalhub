-- RPCs SECURITY DEFINER pour que les joueurs puissent lire la bibliothèque partagée
-- sans dépendre des politiques RLS de player_teams (qui ne couvrent que les coachs).

CREATE OR REPLACE FUNCTION get_my_shared_content()
RETURNS SETOF public.shared_content
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
  SELECT DISTINCT sc.*
  FROM shared_content sc
  JOIN player_teams pt ON pt.team_id = sc.team_id
  WHERE pt.player_id = v_player_id
  ORDER BY sc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_shared_content() TO authenticated;

CREATE OR REPLACE FUNCTION get_my_shared_folders()
RETURNS SETOF public.shared_content_folders
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
  SELECT DISTINCT scf.*
  FROM shared_content_folders scf
  JOIN player_teams pt ON pt.team_id = scf.team_id
  WHERE pt.player_id = v_player_id
  ORDER BY scf.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_shared_folders() TO authenticated;
