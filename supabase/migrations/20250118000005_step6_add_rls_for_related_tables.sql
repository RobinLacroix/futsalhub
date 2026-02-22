-- ============================================
-- ÉTAPE 6 : Ajouter les politiques RLS pour les tables liées
-- ============================================
-- Les joueurs, matches, trainings, etc. héritent du club via leur équipe

-- RLS pour players
-- Les joueurs héritent du club via leur équipe (team_id -> teams.club_id)
DROP POLICY IF EXISTS "Users can view all players" ON players;
DROP POLICY IF EXISTS "Users can insert players" ON players;
DROP POLICY IF EXISTS "Users can update players" ON players;
DROP POLICY IF EXISTS "Users can delete players" ON players;

CREATE POLICY "Users can view their club players" ON players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can insert players in their club" ON players
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can update their club players" ON players
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can delete their club players" ON players
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

-- RLS pour matches
-- Les matches héritent du club via leur équipe (team_id -> teams.club_id)
DROP POLICY IF EXISTS "Enable read access for all users" ON matches;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON matches;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON matches;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON matches;

CREATE POLICY "Users can view their club matches" ON matches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = matches.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can insert matches in their club" ON matches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = matches.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can update their club matches" ON matches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = matches.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can delete their club matches" ON matches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = matches.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

-- RLS pour trainings (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trainings') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view all trainings" ON trainings';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert trainings" ON trainings';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update trainings" ON trainings';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete trainings" ON trainings';
    
    EXECUTE 'CREATE POLICY "Users can view their club trainings" ON trainings
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = trainings.team_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can insert trainings in their club" ON trainings
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = trainings.team_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can update their club trainings" ON trainings
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = trainings.team_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can delete their club trainings" ON trainings
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM teams t
          WHERE t.id = trainings.team_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
  END IF;
END $$;

-- RLS pour match_events
-- Les match_events héritent du club via match -> team (match_id -> matches.team_id -> teams.club_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'match_events') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Enable read access for all users" ON match_events';
    EXECUTE 'DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON match_events';
    EXECUTE 'DROP POLICY IF EXISTS "Enable update for authenticated users only" ON match_events';
    EXECUTE 'DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON match_events';
    
    EXECUTE 'CREATE POLICY "Users can view their club match_events" ON match_events
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM matches m
          JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can insert match_events in their club" ON match_events
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM matches m
          JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can update their club match_events" ON match_events
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM matches m
          JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
    
    EXECUTE 'CREATE POLICY "Users can delete their club match_events" ON match_events
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM matches m
          JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id
            AND t.club_id IS NOT NULL
            AND has_club_access(t.club_id)
        )
      )';
  END IF;
END $$;

-- RLS pour player_teams
-- Les player_teams héritent du club via leur équipe (team_id -> teams.club_id)
DROP POLICY IF EXISTS "Users can view all player_teams" ON player_teams;
DROP POLICY IF EXISTS "Users can modify player_teams" ON player_teams;

CREATE POLICY "Users can view their club player_teams" ON player_teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = player_teams.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can insert player_teams in their club" ON player_teams
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = player_teams.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can update their club player_teams" ON player_teams
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = player_teams.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Users can delete their club player_teams" ON player_teams
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = player_teams.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );
