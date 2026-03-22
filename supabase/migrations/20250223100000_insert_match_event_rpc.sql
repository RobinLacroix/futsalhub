-- RPC pour insérer un match_event (contourne les problèmes RLS sur INSERT+RETURNING)
-- Vérifie has_club_access via match -> team -> club avant d'insérer
CREATE OR REPLACE FUNCTION insert_match_event(
  p_match_id UUID,
  p_event_type TEXT,
  p_match_time_seconds INTEGER,
  p_half INTEGER,
  p_player_id UUID DEFAULT NULL,
  p_players_on_field JSONB DEFAULT '[]'::jsonb
)
RETURNS match_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_result match_events;
BEGIN
  -- Vérifier que l'utilisateur a accès au club du match
  SELECT t.club_id INTO v_club_id
  FROM matches m
  JOIN teams t ON t.id = m.team_id
  WHERE m.id = p_match_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Match ou équipe introuvable';
  END IF;

  IF NOT has_club_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas les droits sur ce club';
  END IF;

  INSERT INTO match_events (match_id, event_type, match_time_seconds, half, player_id, players_on_field)
  VALUES (p_match_id, p_event_type, p_match_time_seconds, p_half, p_player_id, p_players_on_field)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION insert_match_event IS 'Insère un événement de match. Vérifie has_club_access. Utilisé par le tracker mobile.';
