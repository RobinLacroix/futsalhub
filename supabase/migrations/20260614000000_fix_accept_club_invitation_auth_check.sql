-- Fix: accept_club_invitation did not verify that the caller (auth.uid())
-- is the same user as p_user_id, allowing a club admin to force-add another
-- user to the club without that user's consent.
CREATE OR REPLACE FUNCTION accept_club_invitation(p_token UUID, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_invitation club_invitations%ROWTYPE;
BEGIN
  -- Ensure the caller is acting on their own behalf
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas accepter une invitation au nom d''un autre utilisateur';
  END IF;

  SELECT * INTO v_invitation
  FROM club_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation invalide ou expirée';
  END IF;

  -- Vérifier que l'email correspond
  IF LOWER((SELECT email FROM auth.users WHERE id = p_user_id)) != LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Cette invitation est destinée à un autre email';
  END IF;

  -- Créer le membership (si pas déjà membre)
  INSERT INTO club_members (user_id, club_id, role, team_id)
  SELECT p_user_id, v_invitation.club_id, v_invitation.role, v_invitation.team_id
  WHERE NOT EXISTS (
    SELECT 1 FROM club_members WHERE user_id = p_user_id AND club_id = v_invitation.club_id
  );

  -- Marquer l'invitation comme acceptée
  UPDATE club_invitations SET status = 'accepted' WHERE id = v_invitation.id;

  RETURN v_invitation.club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
