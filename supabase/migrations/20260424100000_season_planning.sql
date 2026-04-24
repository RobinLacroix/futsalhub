-- Table de planification de saison
-- Stocke le board de planning par club et saison sous forme JSONB

CREATE TABLE IF NOT EXISTS season_planning (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  season      VARCHAR(20) NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(club_id, season)
);

-- RLS
ALTER TABLE season_planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can read season planning"
  ON season_planning FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = season_planning.club_id
        AND club_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/coaches can write season planning"
  ON season_planning FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = season_planning.club_id
        AND club_members.user_id = auth.uid()
        AND club_members.role IN ('admin', 'coach')
    )
  );
