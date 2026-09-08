-- Demande : le questionnaire wellness (auto-éval / RPE / forme / plaisir) existe
-- aujourd'hui uniquement en fin d'ENTRAÎNEMENT. On l'étend aux MATCHS, en
-- généralisant les tables existantes plutôt qu'en dupliquant training_feedback_tokens
-- / training_player_feedback. Les deux tables gardent leur nom (training_*) pour
-- limiter le churn — elles couvrent désormais training_id OU match_id, jamais les
-- deux (CHECK d'exclusivité).
--
-- Un match n'a pas de statut de présence (`attendance` JSONB) comme un entraînement :
-- seule la convocation existe (`matches.players`). Les questionnaires post-match sont
-- donc envoyés à tous les joueurs convoqués, sur le même principe que les autres
-- notifications de convocation déjà « joueur assumé présent » dans ce projet
-- (cf. planning_published, 20260823130000).

-- ── 1. Schéma : training_id devient optionnel, match_id apparaît ─────────────

ALTER TABLE public.training_feedback_tokens
  ALTER COLUMN training_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id) ON DELETE CASCADE;

ALTER TABLE public.training_feedback_tokens DROP CONSTRAINT IF EXISTS training_feedback_tokens_training_id_player_id_key;
DROP INDEX IF EXISTS training_feedback_tokens_training_id_player_id_key;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_feedback_tokens_one_parent_check'
  ) THEN
    ALTER TABLE public.training_feedback_tokens
      ADD CONSTRAINT training_feedback_tokens_one_parent_check
      CHECK ((training_id IS NOT NULL) <> (match_id IS NOT NULL));
  END IF;
END
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS training_feedback_tokens_training_player_uq
  ON public.training_feedback_tokens(training_id, player_id) WHERE training_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS training_feedback_tokens_match_player_uq
  ON public.training_feedback_tokens(match_id, player_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_feedback_tokens_match_id ON public.training_feedback_tokens(match_id);

ALTER TABLE public.training_player_feedback
  ALTER COLUMN training_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id) ON DELETE CASCADE;

ALTER TABLE public.training_player_feedback DROP CONSTRAINT IF EXISTS training_player_feedback_training_id_player_id_key;
DROP INDEX IF EXISTS training_player_feedback_training_id_player_id_key;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_player_feedback_one_parent_check'
  ) THEN
    ALTER TABLE public.training_player_feedback
      ADD CONSTRAINT training_player_feedback_one_parent_check
      CHECK ((training_id IS NOT NULL) <> (match_id IS NOT NULL));
  END IF;
END
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS training_player_feedback_training_player_uq
  ON public.training_player_feedback(training_id, player_id) WHERE training_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS training_player_feedback_match_player_uq
  ON public.training_player_feedback(match_id, player_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_player_feedback_match_id ON public.training_player_feedback(match_id);

-- RLS existante (has_club_access via trainings->teams) ne couvre pas les lignes
-- match_id : les policies USING ne matchent que training_id IS NOT NULL (le JOIN
-- trainings tr ON tr.id = training_player_feedback.training_id échoue silencieusement
-- si training_id est NULL). On ajoute l'équivalent match, en complément (policies
-- permissives = OU, cf. piège RLS documenté dans CLAUDE.md — chacune couvre son cas,
-- aucune n'est un USING (true)).
DROP POLICY IF EXISTS "Users can view match_player_feedback" ON public.training_player_feedback;
CREATE POLICY "Users can view match_player_feedback" ON public.training_player_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id = m.team_id
      WHERE m.id = training_player_feedback.match_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

DROP POLICY IF EXISTS "training feedback tokens club scoped match" ON public.training_feedback_tokens;
CREATE POLICY "training feedback tokens club scoped match" ON public.training_feedback_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN teams t ON t.id = m.team_id
      WHERE m.id = training_feedback_tokens.match_id
        AND t.club_id IS NOT NULL
        AND has_club_access(t.club_id)
    )
  );

-- ── 2. RPC : le coach envoie les questionnaires pour un match ────────────────
-- Miroir de create_feedback_tokens_for_training, mais sans notion de présence :
-- tous les joueurs convoqués (matches.players) reçoivent un token.
CREATE OR REPLACE FUNCTION create_feedback_tokens_for_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id  UUID;
  v_team_id   UUID;
  v_players   JSONB;
  v_elem      JSONB;
  v_player_id UUID;
  v_inserted  INT := 0;
  v_token     TEXT;
  v_expires   TIMESTAMPTZ;
BEGIN
  SELECT m.id, m.team_id, COALESCE(m.players, '[]'::jsonb)
    INTO v_match_id, v_team_id, v_players
  FROM matches m
  WHERE m.id = p_match_id;

  IF v_match_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_not_found');
  END IF;

  IF v_team_id IS NULL OR NOT has_team_write_access(v_team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_expires := NOW() + INTERVAL '7 days';

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_players)
  LOOP
    v_player_id := (v_elem->>'id')::UUID;
    CONTINUE WHEN v_player_id IS NULL;

    v_token := gen_random_uuid()::text;
    INSERT INTO training_feedback_tokens (match_id, player_id, token, expires_at)
    VALUES (p_match_id, v_player_id, v_token, v_expires)
    ON CONFLICT (match_id, player_id) WHERE match_id IS NOT NULL DO UPDATE
      SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used_at = NULL;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION create_feedback_tokens_for_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_feedback_tokens_for_match(UUID) TO authenticated;

-- ── 3. get_feedback_session_by_token : branche match ─────────────────────────
CREATE OR REPLACE FUNCTION get_feedback_session_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_match_id    UUID;
  v_player_id   UUID;
  v_expires_at  TIMESTAMPTZ;
  v_used_at     TIMESTAMPTZ;
  v_session_date TIMESTAMPTZ;
  v_theme       TEXT;
  v_player_name TEXT;
BEGIN
  SELECT tft.training_id, tft.match_id, tft.player_id, tft.expires_at, tft.used_at
    INTO v_training_id, v_match_id, v_player_id, v_expires_at, v_used_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_player_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT p.first_name || ' ' || p.last_name INTO v_player_name FROM players p WHERE p.id = v_player_id;

  IF v_training_id IS NOT NULL THEN
    SELECT tr.date, tr.theme INTO v_session_date, v_theme FROM trainings tr WHERE tr.id = v_training_id;
    RETURN jsonb_build_object(
      'kind', 'training',
      'training_id', v_training_id,
      'player_id', v_player_id,
      'training_date', v_session_date,
      'theme', v_theme,
      'player_name', v_player_name
    );
  ELSE
    SELECT m.date, 'Match' || COALESCE(' vs ' || m.opponent_team, '') INTO v_session_date, v_theme
    FROM matches m WHERE m.id = v_match_id;
    RETURN jsonb_build_object(
      'kind', 'match',
      'match_id', v_match_id,
      'player_id', v_player_id,
      'training_date', v_session_date,
      'theme', v_theme,
      'player_name', v_player_name
    );
  END IF;
END;
$$;

-- Surface anon assumée et documentée (CLAUDE.md) : token gen_random_uuid() = 128 bits.
-- CREATE OR REPLACE préserve l'ACL existante, mais celle-ci n'avait jamais été
-- verrouillée pour cette fonction précise (jamais couverte par la passe d'audit
-- du 2026-08-03) : PUBLIC y avait toujours accès. Corrigé ici, au même titre que
-- toute fonction touchée par une migration (règle non négociable du repo).
REVOKE ALL ON FUNCTION get_feedback_session_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_feedback_session_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_feedback_session_by_token(TEXT) TO authenticated;

-- ── 4. submit_training_feedback (variante avec commentaire) : branche match ──
CREATE OR REPLACE FUNCTION submit_training_feedback(
  p_token            TEXT,
  p_auto_evaluation  SMALLINT,
  p_rpe              SMALLINT,
  p_physical_form    SMALLINT,
  p_pleasure         SMALLINT,
  p_comment          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_id UUID;
  v_match_id    UUID;
  v_player_id   UUID;
  v_expires_at  TIMESTAMPTZ;
  v_used_at     TIMESTAMPTZ;
BEGIN
  SELECT tft.training_id, tft.match_id, tft.player_id, tft.expires_at, tft.used_at
    INTO v_training_id, v_match_id, v_player_id, v_expires_at, v_used_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;
  IF p_auto_evaluation IS NULL OR p_auto_evaluation < 1 OR p_auto_evaluation > 10
     OR p_rpe IS NULL OR p_rpe < 1 OR p_rpe > 10
     OR p_physical_form IS NULL OR p_physical_form < 1 OR p_physical_form > 10
     OR p_pleasure IS NULL OR p_pleasure < 1 OR p_pleasure > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_values');
  END IF;

  -- Deux arbitres de conflit distincts (un par index partiel) : une seule des
  -- deux branches s'exécute, jamais les deux, donc jamais de double insertion.
  IF v_training_id IS NOT NULL THEN
    INSERT INTO training_player_feedback
      (training_id, player_id, auto_evaluation, rpe, physical_form, pleasure, updated_at)
    VALUES
      (v_training_id, v_player_id, p_auto_evaluation, p_rpe, p_physical_form, p_pleasure, NOW())
    ON CONFLICT (training_id, player_id) WHERE training_id IS NOT NULL DO UPDATE SET
      auto_evaluation = EXCLUDED.auto_evaluation,
      rpe             = EXCLUDED.rpe,
      physical_form   = EXCLUDED.physical_form,
      pleasure        = EXCLUDED.pleasure,
      updated_at      = NOW();
  ELSE
    INSERT INTO training_player_feedback
      (match_id, player_id, auto_evaluation, rpe, physical_form, pleasure, updated_at)
    VALUES
      (v_match_id, v_player_id, p_auto_evaluation, p_rpe, p_physical_form, p_pleasure, NOW())
    ON CONFLICT (match_id, player_id) WHERE match_id IS NOT NULL DO UPDATE SET
      auto_evaluation = EXCLUDED.auto_evaluation,
      rpe             = EXCLUDED.rpe,
      physical_form   = EXCLUDED.physical_form,
      pleasure        = EXCLUDED.pleasure,
      updated_at      = NOW();
  END IF;

  UPDATE training_feedback_tokens
  SET used_at = NOW()
  WHERE token = p_token;

  IF p_comment IS NOT NULL AND trim(p_comment) <> '' THEN
    INSERT INTO player_events (player_id, event_type, event_date, report)
    VALUES (v_player_id, 'feedback', CURRENT_DATE, trim(p_comment));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) TO authenticated;

-- Trouvé en vérifiant pg_proc (protocole CLAUDE.md, ne jamais supposer) : la
-- signature à 5 arguments (sans p_comment, remplacée par la 6-args dès juin 2026
-- — 20260608100000) était restée exécutable par PUBLIC, jamais fermée. Plus
-- aucun appelant client (mobile ni web) ne l'utilise — verrouillée sans grant,
-- plutôt que droppée, pour rester dans le principe « pas de changement de
-- comportement hors sécurité » de cette section.
REVOKE ALL ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT) FROM PUBLIC, anon, authenticated;

-- ── 5. get_my_pending_feedback_tokens : + tokens liés à un match ─────────────
-- Signature de retour changée (colonnes en plus) : DROP requis, CREATE OR REPLACE
-- seul ne suffit pas pour changer un RETURNS TABLE.
DROP FUNCTION IF EXISTS get_my_pending_feedback_tokens();

CREATE FUNCTION get_my_pending_feedback_tokens()
RETURNS TABLE(
  training_id   UUID,
  match_id      UUID,
  kind          TEXT,
  training_date TIMESTAMPTZ,
  theme         TEXT,
  token         TEXT,
  url           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    tft.training_id,
    NULL::UUID AS match_id,
    'training'::TEXT AS kind,
    tr.date AS training_date,
    tr.theme,
    tft.token,
    ('/feedback/session/' || tft.token)::text AS url
  FROM training_feedback_tokens tft
  JOIN trainings tr ON tr.id = tft.training_id
  WHERE tft.player_id = v_player_id
    AND tft.training_id IS NOT NULL
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()

  UNION ALL

  SELECT
    NULL::UUID AS training_id,
    tft.match_id,
    'match'::TEXT AS kind,
    m.date AS training_date,
    'Match' || COALESCE(' vs ' || m.opponent_team, '') AS theme,
    tft.token,
    ('/feedback/session/' || tft.token)::text AS url
  FROM training_feedback_tokens tft
  JOIN matches m ON m.id = tft.match_id
  WHERE tft.player_id = v_player_id
    AND tft.match_id IS NOT NULL
    AND tft.used_at IS NULL
    AND tft.expires_at > NOW()

  ORDER BY training_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_my_pending_feedback_tokens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_pending_feedback_tokens() TO authenticated;

-- ── 6. get_match_feedback_responses : miroir staff de la vue match ───────────
CREATE OR REPLACE FUNCTION get_match_feedback_responses(p_match_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'player_id', p.id,
      'player_name', p.first_name || ' ' || p.last_name,
      'team_id', p.team_id,
      'team_name', tm.name,
      'is_guest', (p.team_id IS DISTINCT FROM m.team_id),
      'auto_evaluation', f.auto_evaluation,
      'rpe', f.rpe,
      'physical_form', f.physical_form,
      'pleasure', f.pleasure,
      'submitted_at', f.updated_at,
      'comment', pe.report
    ) ORDER BY p.first_name, p.last_name
  ), '[]'::jsonb)
  FROM training_player_feedback f
  JOIN matches m ON m.id = f.match_id
  JOIN players p ON p.id = f.player_id
  LEFT JOIN teams tm ON tm.id = p.team_id
  LEFT JOIN player_events pe
    ON pe.player_id = f.player_id
   AND pe.event_type = 'feedback'
   AND pe.event_date = m.date::date
  WHERE f.match_id = p_match_id
    AND has_team_access(m.team_id);
$$;

REVOKE ALL ON FUNCTION get_match_feedback_responses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_match_feedback_responses(UUID) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_leak TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  WHERE p.proname IN (
    'create_feedback_tokens_for_match','get_feedback_session_by_token',
    'get_my_pending_feedback_tokens','get_match_feedback_responses',
    'submit_training_feedback'
  )
  AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions questionnaire match encore exécutables par PUBLIC : %', v_leak;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'training_feedback_tokens' AND column_name = 'match_id'
  ) THEN
    RAISE EXCEPTION 'training_feedback_tokens.match_id aurait dû être créée par cette migration';
  END IF;
END;
$verify$;
