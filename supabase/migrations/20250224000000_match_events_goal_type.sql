-- Types de buts : Phase offensive, Transition, CPA, Supériorité
-- Pour les événements goal et opponent_goal uniquement

ALTER TABLE match_events
ADD COLUMN IF NOT EXISTS goal_type TEXT
CHECK (goal_type IS NULL OR goal_type IN ('offensive', 'transition', 'cpa', 'superiority'));

CREATE INDEX IF NOT EXISTS idx_match_events_goal_type ON match_events(goal_type) WHERE goal_type IS NOT NULL;

COMMENT ON COLUMN match_events.goal_type IS 'Type de but: offensive, transition, cpa, superiority. Uniquement pour goal/opponent_goal.';

-- Mise à jour de insert_match_event pour accepter goal_type
DROP FUNCTION IF EXISTS insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB);
DROP FUNCTION IF EXISTS insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision);

CREATE OR REPLACE FUNCTION insert_match_event(
  p_match_id UUID,
  p_event_type TEXT,
  p_match_time_seconds INTEGER,
  p_half INTEGER,
  p_player_id UUID DEFAULT NULL,
  p_players_on_field JSONB DEFAULT '[]'::jsonb,
  p_location_x double precision DEFAULT NULL,
  p_location_y double precision DEFAULT NULL,
  p_goal_type TEXT DEFAULT NULL
)
RETURNS match_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_team_id UUID;
  v_result match_events;
BEGIN
  SELECT m.team_id, t.club_id INTO v_team_id, v_club_id
  FROM matches m
  LEFT JOIN teams t ON t.id = m.team_id
  WHERE m.id = p_match_id;

  IF v_team_id IS NULL AND v_club_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id) THEN
      RAISE EXCEPTION 'Match introuvable';
    ELSE
      RAISE EXCEPTION 'Le match n''est pas associé à une équipe. Associez une équipe au match.';
    END IF;
  END IF;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'L''équipe du match n''est pas associée à un club.';
  END IF;

  IF NOT has_club_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas les droits sur ce club';
  END IF;

  IF p_goal_type IS NOT NULL AND p_event_type NOT IN ('goal', 'opponent_goal') THEN
    RAISE EXCEPTION 'goal_type ne peut être renseigné que pour les événements goal ou opponent_goal';
  END IF;

  INSERT INTO match_events (match_id, team_id, event_type, match_time_seconds, half, player_id, players_on_field, location_x, location_y, goal_type)
  VALUES (p_match_id, v_team_id, p_event_type, p_match_time_seconds, p_half, p_player_id, p_players_on_field, p_location_x, p_location_y, p_goal_type)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision, TEXT) TO authenticated;

COMMENT ON FUNCTION insert_match_event IS 'Insère un événement de match. Vérifie has_club_access. goal_type optionnel pour goal/opponent_goal.';
