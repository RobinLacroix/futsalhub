-- ============================================
-- ÉTAPE 4 : Créer les fonctions helper pour les permissions
-- ============================================

-- Fonction pour obtenir le club_id d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_club_id()
RETURNS UUID AS $$
DECLARE
  user_club_id UUID;
BEGIN
  SELECT club_id INTO user_club_id
  FROM club_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN user_club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour vérifier si un utilisateur est admin d'un club
CREATE OR REPLACE FUNCTION is_club_admin(p_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
BEGIN
  -- Si aucun club_id n'est fourni, utiliser celui de l'utilisateur
  IF p_club_id IS NULL THEN
    v_club_id := get_user_club_id();
  ELSE
    v_club_id := p_club_id;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM club_members
    WHERE user_id = auth.uid()
      AND club_id = v_club_id
      AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour vérifier si un utilisateur est entraîneur d'une équipe
CREATE OR REPLACE FUNCTION is_team_coach(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM club_members
    WHERE user_id = auth.uid()
      AND team_id = p_team_id
      AND role = 'coach'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour vérifier si un utilisateur a accès à un club (admin ou coach d'une équipe du club)
CREATE OR REPLACE FUNCTION has_club_access(p_club_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = p_club_id
      AND (
        cm.role = 'admin'
        OR (cm.role = 'coach' AND cm.team_id IS NOT NULL)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour vérifier si un utilisateur a accès à une équipe (admin du club ou coach de l'équipe)
CREATE OR REPLACE FUNCTION has_team_access(p_team_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_club_id UUID;
BEGIN
  -- Récupérer le club_id de l'équipe
  SELECT club_id INTO v_club_id
  FROM teams
  WHERE id = p_team_id;
  
  IF v_club_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Vérifier si l'utilisateur est admin du club ou coach de l'équipe
  RETURN EXISTS (
    SELECT 1
    FROM club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = v_club_id
      AND (
        cm.role = 'admin'
        OR (cm.role = 'coach' AND cm.team_id = p_team_id)
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fonction pour créer un club pour un nouvel utilisateur
CREATE OR REPLACE FUNCTION create_user_club(p_user_id UUID, p_user_email TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  new_club_id UUID;
  user_email TEXT;
BEGIN
  -- Récupérer l'email si non fourni
  IF p_user_email IS NULL THEN
    SELECT email INTO user_email FROM auth.users WHERE id = p_user_id;
  ELSE
    user_email := p_user_email;
  END IF;
  
  -- Vérifier si l'utilisateur a déjà un club
  SELECT club_id INTO new_club_id
  FROM club_members
  WHERE user_id = p_user_id
  LIMIT 1;
  
  -- Si l'utilisateur n'a pas de club, en créer un
  IF new_club_id IS NULL THEN
    INSERT INTO clubs (id, name, description, created_at)
    VALUES (
      gen_random_uuid(),
      COALESCE(split_part(user_email, '@', 1), 'Nouveau') || ' - Club',
      'Club créé automatiquement pour ' || COALESCE(user_email, 'nouvel utilisateur'),
      NOW()
    )
    RETURNING id INTO new_club_id;
    
    -- Créer le membership admin
    INSERT INTO club_members (user_id, club_id, role, created_at)
    VALUES (p_user_id, new_club_id, 'admin', NOW());
  END IF;
  
  RETURN new_club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commentaires
COMMENT ON FUNCTION get_user_club_id() IS 'Retourne le club_id de l''utilisateur connecté';
COMMENT ON FUNCTION is_club_admin(UUID) IS 'Vérifie si l''utilisateur est admin d''un club';
COMMENT ON FUNCTION is_team_coach(UUID) IS 'Vérifie si l''utilisateur est entraîneur d''une équipe';
COMMENT ON FUNCTION has_club_access(UUID) IS 'Vérifie si l''utilisateur a accès à un club (admin ou coach)';
COMMENT ON FUNCTION has_team_access(UUID) IS 'Vérifie si l''utilisateur a accès à une équipe (admin du club ou coach de l''équipe)';
COMMENT ON FUNCTION create_user_club(UUID, TEXT) IS 'Crée un club pour un utilisateur et le définit comme admin. À appeler lors de l''inscription.';
