-- Table player_events : événements marquants pour le suivi des joueurs
-- Typologies : entretien individuel, blessure, suspension

CREATE TABLE IF NOT EXISTS player_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('interview', 'injury', 'suspension')),
  event_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Entretien individuel : compte rendu
  report TEXT,

  -- Blessure : type et durée d'indisponibilité (en jours)
  injury_type TEXT,
  unavailability_days INTEGER,

  -- Suspension : nombre de matchs
  matches_suspended INTEGER
);

CREATE INDEX IF NOT EXISTS idx_player_events_player_id ON player_events(player_id);
CREATE INDEX IF NOT EXISTS idx_player_events_event_date ON player_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_events_event_type ON player_events(event_type);

-- Fonction pour vérifier l'accès à un joueur (via player_teams -> team)
CREATE OR REPLACE FUNCTION has_player_access(p_player_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM player_teams pt
    WHERE pt.player_id = p_player_id
      AND has_team_access(pt.team_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS pour player_events
ALTER TABLE player_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their club player_events" ON player_events
  FOR SELECT USING (has_player_access(player_id));

CREATE POLICY "Users can insert player_events for their club players" ON player_events
  FOR INSERT WITH CHECK (has_player_access(player_id));

CREATE POLICY "Users can update their club player_events" ON player_events
  FOR UPDATE USING (has_player_access(player_id));

CREATE POLICY "Users can delete their club player_events" ON player_events
  FOR DELETE USING (has_player_access(player_id));

COMMENT ON TABLE player_events IS 'Événements marquants pour le suivi des joueurs : entretiens, blessures, suspensions';
