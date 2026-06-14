-- Fix: make setTeamMainCoach atomic using upsert instead of delete+insert
-- Previous pattern: DELETE all coaches then INSERT new one — if insert fails,
-- the team is left without any coach. Replace with ON CONFLICT upsert.

CREATE OR REPLACE FUNCTION set_team_main_coach(p_team_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  -- Verify caller has admin access to this team's club
  SELECT t.club_id INTO v_club_id FROM teams t WHERE t.id = p_team_id;

  IF v_club_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF NOT has_club_admin_access(v_club_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_access');
  END IF;

  -- Atomic upsert: insert new coach or update existing row for this team
  -- First remove other coach entries for this team (can't have two coaches)
  DELETE FROM club_members
  WHERE team_id = p_team_id AND role = 'coach' AND user_id != p_user_id;

  -- Upsert the new coach
  INSERT INTO club_members (user_id, club_id, role, team_id)
  VALUES (p_user_id, v_club_id, 'coach', p_team_id)
  ON CONFLICT (user_id, club_id, team_id) DO UPDATE
    SET role = 'coach', updated_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION set_team_main_coach(UUID, UUID) TO authenticated;
