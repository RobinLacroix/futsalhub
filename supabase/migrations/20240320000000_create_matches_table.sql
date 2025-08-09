-- Create matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT NOT NULL,
    competition TEXT NOT NULL,
    score_team INTEGER NOT NULL DEFAULT 0,
    score_opponent INTEGER NOT NULL DEFAULT 0,
    players JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS policies
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON matches
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON matches
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON matches
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON matches
    FOR DELETE USING (auth.role() = 'authenticated');

-- Create index on date for better performance
CREATE INDEX matches_date_idx ON matches (date);

-- Create index on competition for better performance
CREATE INDEX matches_competition_idx ON matches (competition); 