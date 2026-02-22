-- ============================================
-- ÉTAPE 7 : Migrer les données existantes
-- ============================================
-- Créer un club pour chaque utilisateur et associer les équipes existantes

DO $$
DECLARE
  user_record RECORD;
  user_club_id UUID;
  default_club_id UUID;
BEGIN
  -- ============================================
  -- 1. CRÉER UN CLUB POUR CHAQUE UTILISATEUR
  -- ============================================
  FOR user_record IN 
    SELECT id, email FROM auth.users
  LOOP
    -- Créer un club pour cet utilisateur s'il n'en a pas déjà un
    SELECT club_id INTO user_club_id
    FROM club_members
    WHERE user_id = user_record.id
    LIMIT 1;
    
    IF user_club_id IS NULL THEN
      -- Créer un nouveau club pour cet utilisateur
      INSERT INTO clubs (id, name, description, created_at)
      VALUES (
        gen_random_uuid(),
        COALESCE(split_part(user_record.email, '@', 1), 'Club') || ' - Club',
        'Club créé automatiquement pour ' || user_record.email,
        NOW()
      )
      RETURNING id INTO user_club_id;
      
      -- Créer le membership admin pour cet utilisateur
      INSERT INTO club_members (user_id, club_id, role, created_at)
      VALUES (user_record.id, user_club_id, 'admin', NOW())
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- ============================================
  -- 2. CRÉER UN CLUB PAR DÉFAUT POUR LES ÉQUIPES SANS CLUB
  -- ============================================
  SELECT id INTO default_club_id
  FROM clubs
  WHERE name = 'Club par défaut'
  LIMIT 1;
  
  IF default_club_id IS NULL THEN
    INSERT INTO clubs (id, name, description, created_at)
    VALUES (gen_random_uuid(), 'Club par défaut', 'Club créé automatiquement pour les équipes existantes', NOW())
    RETURNING id INTO default_club_id;
  END IF;
  
  -- ============================================
  -- 3. ASSOCIER LES ÉQUIPES EXISTANTES AU CLUB PAR DÉFAUT
  -- ============================================
  -- Les équipes sans club sont associées au club par défaut
  -- Les utilisateurs pourront les réassigner à leur club plus tard
  UPDATE teams
  SET club_id = default_club_id
  WHERE club_id IS NULL;
  
END $$;

-- Commentaire pour la documentation
COMMENT ON TABLE clubs IS 'Table des clubs - chaque club a ses propres équipes et données isolées. Un club est créé automatiquement pour chaque utilisateur.';
