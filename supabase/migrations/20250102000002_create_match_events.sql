-- Migration pour créer la table des événements de match
-- Enregistre chaque action en temps réel pendant le match

CREATE TABLE match_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'goal', 'shot', 'shot_on_target', 'recovery', 
            'yellow_card', 'red_card', 'dribble', 'ball_loss',
            'opponent_goal', 'opponent_shot', 'opponent_shot_on_target'
        )
    ),
    match_time_seconds INTEGER NOT NULL, -- Temps écoulé depuis le début de la mi-temps
    half INTEGER NOT NULL CHECK (half IN (1, 2)), -- Mi-temps 1 ou 2
    player_id UUID REFERENCES players(id) ON DELETE CASCADE, -- NULL si c'est l'adversaire
    players_on_field JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array des IDs des joueurs sur le terrain
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index pour améliorer les performances
CREATE INDEX idx_match_events_match_id ON match_events(match_id);
CREATE INDEX idx_match_events_event_type ON match_events(event_type);
CREATE INDEX idx_match_events_player_id ON match_events(player_id);
CREATE INDEX idx_match_events_match_time ON match_events(match_time_seconds);
CREATE INDEX idx_match_events_half ON match_events(half);

-- RLS policies
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON match_events
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON match_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON match_events
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON match_events
    FOR DELETE USING (auth.role() = 'authenticated');

-- Fonction pour supprimer le dernier événement d'un type donné pour un match
CREATE OR REPLACE FUNCTION delete_last_event_by_type(
    p_match_id UUID,
    p_event_type TEXT,
    p_player_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM match_events 
    WHERE match_id = p_match_id 
    AND event_type = p_event_type
    AND (p_player_id IS NULL OR player_id = p_player_id)
    AND id = (
        SELECT id FROM match_events 
        WHERE match_id = p_match_id 
        AND event_type = p_event_type
        AND (p_player_id IS NULL OR player_id = p_player_id)
        ORDER BY created_at DESC 
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql; 