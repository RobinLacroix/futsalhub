-- ─────────────────────────────────────────────────────────────────────────────
-- Accès : resserrer l'ÉCRITURE au périmètre de l'équipe (team-scoped).
--
-- Avant : les policies INSERT/UPDATE/DELETE des tables de contenu utilisaient
-- has_club_write_access(club_id) (players, matches, player_teams) ou même
-- has_club_access(club_id) (trainings, match_events, viewer inclus !) => n'importe
-- quel coach du club pouvait modifier le contenu de n'importe quelle équipe, et un
-- viewer pouvait écrire trainings/match_events.
--
-- Après : les écritures passent par has_team_write_access(team_id) (admin du club
-- OU coach rattaché à CETTE équipe ; multi-équipes géré). La LECTURE reste
-- club-wide (has_club_access) : un coach voit toutes les équipes du club, sans
-- pouvoir les modifier. L'admin garde l'accès total.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── players ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert players in their club" ON players;
DROP POLICY IF EXISTS "Users can update their club players"    ON players;
DROP POLICY IF EXISTS "Users can delete their club players"    ON players;

CREATE POLICY "Users can insert players in their team" ON players
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can update their team players" ON players
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can delete their team players" ON players
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = players.team_id AND has_team_write_access(t.id))
  );

-- ── matches ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert matches in their club" ON matches;
DROP POLICY IF EXISTS "Users can update their club matches"    ON matches;
DROP POLICY IF EXISTS "Users can delete their club matches"    ON matches;

CREATE POLICY "Users can insert matches in their team" ON matches
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can update their team matches" ON matches
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can delete their team matches" ON matches
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = matches.team_id AND has_team_write_access(t.id))
  );

-- ── player_teams ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert player_teams in their club" ON player_teams;
DROP POLICY IF EXISTS "Users can update their club player_teams"    ON player_teams;
DROP POLICY IF EXISTS "Users can delete their club player_teams"    ON player_teams;

CREATE POLICY "Users can insert player_teams in their team" ON player_teams
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can update their team player_teams" ON player_teams
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND has_team_write_access(t.id))
  );
CREATE POLICY "Users can delete their team player_teams" ON player_teams
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = player_teams.team_id AND has_team_write_access(t.id))
  );

-- ── trainings (écriture encore en has_club_access depuis step6 : viewer inclus) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trainings') THEN
    DROP POLICY IF EXISTS "Users can insert trainings in their club" ON trainings;
    DROP POLICY IF EXISTS "Users can update their club trainings"    ON trainings;
    DROP POLICY IF EXISTS "Users can delete their club trainings"    ON trainings;

    CREATE POLICY "Users can insert trainings in their team" ON trainings
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM teams t WHERE t.id = trainings.team_id AND has_team_write_access(t.id))
      );
    CREATE POLICY "Users can update their team trainings" ON trainings
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM teams t WHERE t.id = trainings.team_id AND has_team_write_access(t.id))
      );
    CREATE POLICY "Users can delete their team trainings" ON trainings
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM teams t WHERE t.id = trainings.team_id AND has_team_write_access(t.id))
      );
  END IF;
END $$;

-- ── match_events (écriture encore en has_club_access depuis step6 : viewer inclus) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'match_events') THEN
    DROP POLICY IF EXISTS "Users can insert match_events in their club" ON match_events;
    DROP POLICY IF EXISTS "Users can update their club match_events"    ON match_events;
    DROP POLICY IF EXISTS "Users can delete their club match_events"    ON match_events;

    CREATE POLICY "Users can insert match_events in their team" ON match_events
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id AND has_team_write_access(t.id)
        )
      );
    CREATE POLICY "Users can update their team match_events" ON match_events
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id AND has_team_write_access(t.id)
        )
      );
    CREATE POLICY "Users can delete their team match_events" ON match_events
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM matches m JOIN teams t ON t.id = m.team_id
          WHERE m.id = match_events.match_id AND has_team_write_access(t.id)
        )
      );
  END IF;
END $$;

-- ── RPC insert_match_event : check team-scoped au lieu de has_club_access ──────
-- (v_team_id est déjà résolu dans la fonction ; on remplace juste le contrôle.)
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
  IF p_half IS NULL OR p_half NOT IN (1, 2) THEN
    RAISE EXCEPTION 'half doit être 1 ou 2 (reçu: %)', p_half;
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN (
    'goal', 'shot', 'shot_on_target', 'recovery',
    'yellow_card', 'red_card', 'assist', 'ball_loss',
    'opponent_goal', 'opponent_shot', 'opponent_shot_on_target'
  ) THEN
    RAISE EXCEPTION 'event_type inconnu pour match_events: %', p_event_type;
  END IF;

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

  IF NOT has_team_write_access(v_team_id) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas les droits d''écriture sur cette équipe';
  END IF;

  IF p_goal_type IS NOT NULL AND p_event_type NOT IN ('goal', 'opponent_goal') THEN
    RAISE EXCEPTION 'goal_type ne peut être renseigné que pour les événements goal ou opponent_goal';
  END IF;

  INSERT INTO match_events (match_id, team_id, event_type, match_time_seconds, half, player_id, players_on_field, location_x, location_y, goal_type)
  VALUES (p_match_id, v_team_id, p_event_type, p_match_time_seconds, p_half, p_player_id, COALESCE(p_players_on_field, '[]'::jsonb), p_location_x, p_location_y, p_goal_type)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_match_event(UUID, TEXT, INTEGER, INTEGER, UUID, JSONB, double precision, double precision, TEXT) TO authenticated;

-- ── RPC utilitaire pour le frontend : les team_ids éditables par l'appelant ────
-- Admin => toutes les équipes de son club ; coach => ses équipes rattachées.
-- Sert à passer l'UI en lecture seule sur les équipes non éditables.
CREATE OR REPLACE FUNCTION get_my_writable_team_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    -- équipes des clubs où l'appelant est admin
    SELECT DISTINCT t.id
    FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    UNION
    -- équipes où l'appelant est coach rattaché
    SELECT DISTINCT cm.team_id
    FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.role = 'coach' AND cm.team_id IS NOT NULL
  ), ARRAY[]::UUID[]);
$$;

GRANT EXECUTE ON FUNCTION get_my_writable_team_ids() TO authenticated;
