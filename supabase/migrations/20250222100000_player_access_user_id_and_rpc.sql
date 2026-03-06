-- ============================================
-- Accès joueurs : lier un compte utilisateur à un joueur
-- - players.user_id : lien auth -> joueur
-- - Joueur peut voir les entraînements de ses équipes et mettre à jour sa présence
-- - Joueur peut voir ses tokens de questionnaire en attente
-- ============================================

-- 1. Colonne user_id sur players (optionnelle)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN players.user_id IS 'Compte utilisateur associé au joueur (accès espace joueur)';

-- 2. RLS : le joueur peut lire et mettre à jour sa propre fiche (pour afficher son profil)
-- On garde les politiques existantes pour coach/admin ; on ajoute une politique SELECT/UPDATE pour user_id = auth.uid()
DROP POLICY IF EXISTS "Users can view their club players" ON players;
CREATE POLICY "Users can view their club players" ON players
  FOR SELECT USING (
    (players.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN teams t ON t.id = pt.team_id
      WHERE pt.player_id = players.id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

-- Politique UPDATE : le joueur peut uniquement mettre à jour son propre user_id (liaison compte) ou rien d'autre côté joueur.
-- En pratique on n'autorise pas le joueur à modifier sa fiche joueur (nom, etc.) ; seul le coach peut.
-- Donc on ne pas d'UPDATE pour user_id = auth.uid(). Les coachs gardent l'UPDATE via has_club_access.
-- Si plus tard tu veux que le joueur puisse modifier son email affiché, on pourra ajouter une politique ciblée.

-- 3. Trainings : les joueurs doivent pouvoir LIRE les entraînements des équipes dont ils font partie
DROP POLICY IF EXISTS "Users can view their club trainings" ON trainings;
CREATE POLICY "Users can view their club trainings" ON trainings
  FOR SELECT USING (
    has_club_access((SELECT club_id FROM teams WHERE id = trainings.team_id))
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players p ON p.id = pt.player_id
      WHERE pt.team_id = trainings.team_id
        AND p.user_id = auth.uid()
    )
  );

-- 4. RPC : le joueur met à jour sa présence pour un entraînement (présent / absent / en retard)
CREATE OR REPLACE FUNCTION set_my_training_attendance(p_training_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_id UUID;
  v_in_team BOOLEAN;
  v_attendance JSONB;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('present', 'absent', 'late') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_player');
  END IF;

  SELECT tr.team_id INTO v_team_id
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM player_teams pt
    WHERE pt.player_id = v_player_id AND pt.team_id = v_team_id
  ) INTO v_in_team;

  IF NOT v_in_team THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_team');
  END IF;

  SELECT COALESCE(tr.attendance, '{}'::jsonb) INTO v_attendance
  FROM trainings tr
  WHERE tr.id = p_training_id;

  v_attendance := jsonb_set(v_attendance, ARRAY[v_player_id::text], to_jsonb(p_status::text), true);

  UPDATE trainings
  SET attendance = v_attendance
  WHERE id = p_training_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. RPC : liste des convocations (entraînements à venir des équipes du joueur) avec statut de présence et token questionnaire si dispo
CREATE OR REPLACE FUNCTION get_my_convocations()
RETURNS TABLE (
  training_id UUID,
  training_date TIMESTAMPTZ,
  location TEXT,
  theme TEXT,
  team_name TEXT,
  my_status TEXT,
  feedback_token TEXT,
  feedback_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tr.id AS training_id,
    tr.date AS training_date,
    tr.location,
    tr.theme,
    t.name AS team_name,
    (tr.attendance->>v_player_id::text)::text AS my_status,
    tft.token AS feedback_token,
    (CASE WHEN tft.token IS NOT NULL THEN ('/feedback/session/' || tft.token)::text ELSE NULL END) AS feedback_url
  FROM trainings tr
  JOIN teams t ON t.id = tr.team_id
  JOIN player_teams pt ON pt.team_id = tr.team_id AND pt.player_id = v_player_id
  LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
    AND tft.player_id = v_player_id
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()
  WHERE tr.date >= (NOW() AT TIME ZONE 'Europe/Paris')::date
  ORDER BY tr.date ASC;
END;
$$;

-- 7. RPC : tokens de questionnaire en attente (pour la page "Mes questionnaires")
CREATE OR REPLACE FUNCTION get_my_pending_feedback_tokens()
RETURNS TABLE (
  training_id UUID,
  training_date TIMESTAMPTZ,
  theme TEXT,
  token TEXT,
  url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tft.training_id,
    tr.date AS training_date,
    tr.theme,
    tft.token,
    ('/feedback/session/' || tft.token)::text AS url
  FROM training_feedback_tokens tft
  JOIN trainings tr ON tr.id = tft.training_id
  WHERE tft.player_id = v_player_id
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()
  ORDER BY tr.date DESC;
END;
$$;

-- 5. training_feedback_tokens : le joueur peut lire ses propres tokens (pour afficher "questionnaires à remplir")
DROP POLICY IF EXISTS "Users can manage tokens for their club trainings" ON training_feedback_tokens;

CREATE POLICY "Coaches can manage tokens for their club trainings" ON training_feedback_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM trainings tr
      JOIN teams t ON t.id = tr.team_id
      WHERE tr.id = training_feedback_tokens.training_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

CREATE POLICY "Players can view their own feedback tokens" ON training_feedback_tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = training_feedback_tokens.player_id
        AND p.user_id = auth.uid()
    )
  );
