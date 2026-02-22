-- ============================================
-- ÉTAPE 1 : Créer la table clubs
-- ============================================

CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);

-- Activer RLS
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Commentaires
COMMENT ON TABLE clubs IS 'Table des clubs - chaque club a ses propres équipes et données isolées';
