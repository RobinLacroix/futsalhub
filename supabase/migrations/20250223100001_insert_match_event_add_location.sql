-- Mise à jour de insert_match_event : team_id + location_x/y
-- 1. S'assurer que match_events a la colonne team_id
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
CREATE INDEX IF NOT EXISTS idx_match_events_team_id ON match_events(team_id);

-- 2. Remplir team_id pour les événements existants
UPDATE match_events me SET team_id = m.team_id
FROM matches m WHERE me.match_id = m.id AND me.team_id IS NULL;

-- 3. Drop les anciennes versions pour recréer proprement
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
  p_location_y double precision DEFAULT NULL
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

  INSERT INTO match_events (match_id, team_id, event_type, match_time_seconds, half, player_id, players_on_field, location_x, location_y)
  VALUES (p_match_id, v_team_id, p_event_type, p_match_time_seconds, p_half, p_player_id, p_players_on_field, p_location_x, p_location_y)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision) TO authenticated;
