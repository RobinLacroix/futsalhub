-- ─────────────────────────────────────────────────────────────────────────────
-- Invitations staff : code court et lisible (au lieu du token UUID de 36 car.).
--
-- Modèle inchangé : l'invitation reste NOMINATIVE (verrouillée sur l'email de
-- l'invité), expirante (7 j) et révocable. Seul le format de l'identifiant
-- partagé change : un code 8 caractères type ABC12XYZ, aligné sur le code de
-- liaison joueur (même charset sans ambiguïté 0/O/1/I).
--
-- Le token UUID existant est conservé (lien /invite/[token] toujours valide).
-- Le code court est le nouveau canal de partage manuel.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Générateur de code unique pour les invitations ────────────────────────────
CREATE OR REPLACE FUNCTION _gen_invitation_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT;
  i INT;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM club_invitations WHERE code = result);
  END LOOP;
  RETURN result;
END;
$$;

-- ── Colonne code + unicité ────────────────────────────────────────────────────
ALTER TABLE club_invitations ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill des invitations existantes sans code
UPDATE club_invitations SET code = _gen_invitation_code() WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_invitations_code ON club_invitations(code);

-- ── Trigger : renseigne le code à l'insertion s'il est absent ──────────────────
CREATE OR REPLACE FUNCTION _set_invitation_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
    NEW.code := _gen_invitation_code();
  ELSE
    NEW.code := upper(trim(NEW.code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invitation_code ON club_invitations;
CREATE TRIGGER set_invitation_code
  BEFORE INSERT ON club_invitations
  FOR EACH ROW
  EXECUTE FUNCTION _set_invitation_code();

-- ── RPC : accepter une invitation via le code court ───────────────────────────
-- Même logique que accept_club_invitation (nominatif : check email), lookup par code.
CREATE OR REPLACE FUNCTION accept_club_invitation_by_code(p_code TEXT, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_invitation club_invitations%ROWTYPE;
BEGIN
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas accepter une invitation au nom d''un autre utilisateur';
  END IF;

  SELECT * INTO v_invitation
  FROM club_invitations
  WHERE code = upper(trim(p_code))
    AND status = 'pending'
    AND expires_at > NOW();

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Code invalide ou expiré';
  END IF;

  -- Invitation nominative : l'email de l'invité doit correspondre au compte
  IF LOWER((SELECT email FROM auth.users WHERE id = p_user_id)) <> LOWER(v_invitation.email) THEN
    RAISE EXCEPTION 'Cette invitation est destinée à une autre adresse email';
  END IF;

  INSERT INTO club_members (user_id, club_id, role, team_id)
  SELECT p_user_id, v_invitation.club_id, v_invitation.role, v_invitation.team_id
  WHERE NOT EXISTS (
    SELECT 1 FROM club_members WHERE user_id = p_user_id AND club_id = v_invitation.club_id
  );

  UPDATE club_invitations SET status = 'accepted' WHERE id = v_invitation.id;

  RETURN v_invitation.club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION accept_club_invitation_by_code(TEXT, UUID) TO authenticated;
