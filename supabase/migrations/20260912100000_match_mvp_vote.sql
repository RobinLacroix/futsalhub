-- Vote MVP de fin de match, en première question (obligatoire) du questionnaire
-- post-match existant (training_feedback_tokens / submit_training_feedback,
-- cf. 20260827160000_match_feedback_questionnaire.sql). Pas d'auto-vote. Le MVP
-- du match est calculé une fois que tous les joueurs convoqués (matches.players,
-- même convention « joueur assumé présent » que le reste du module questionnaire)
-- ont répondu — jamais avant, un classement partiel n'a pas de sens tant que tout
-- le monde n'a pas voté. En cas d'égalité au nombre de voix, tous les joueurs à
-- égalité reçoivent le titre (MVP partagé) plutôt qu'un départage arbitraire.

-- ── 1. Schéma : résultat MVP sur matches, table des votes ────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS mvp_player_ids UUID[],
  ADD COLUMN IF NOT EXISTS mvp_computed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.match_mvp_votes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  voter_player_id  UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  voted_player_id  UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT match_mvp_votes_no_self_vote CHECK (voter_player_id <> voted_player_id),
  CONSTRAINT match_mvp_votes_match_voter_uq UNIQUE (match_id, voter_player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_mvp_votes_match_id ON public.match_mvp_votes(match_id);

ALTER TABLE public.match_mvp_votes ENABLE ROW LEVEL SECURITY;

-- Lecture staff uniquement (classement des votes) : jamais de policy cliente
-- d'écriture, l'insertion passe exclusivement par submit_training_feedback
-- (SECURITY DEFINER, contourne RLS), sur le même modèle que les autres tables
-- de ce module (training_player_feedback, training_feedback_tokens).
DROP POLICY IF EXISTS "match mvp votes staff read" ON public.match_mvp_votes;
CREATE POLICY "match mvp votes staff read" ON public.match_mvp_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_mvp_votes.match_id
        AND has_team_access(m.team_id)
    )
  );

-- ── 2. get_feedback_session_by_token : + liste des coéquipiers votables ──────
-- Ajoute `teammates` (id + nom, hors le votant lui-même) quand kind = 'match',
-- pour peupler le choix MVP dans le formulaire. Type de retour inchangé (JSONB
-- scalaire) : CREATE OR REPLACE suffit, pas de DROP nécessaire.
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
  v_teammates   JSONB;
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

    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name)
      ORDER BY p.first_name, p.last_name
    ), '[]'::jsonb)
    INTO v_teammates
    FROM matches m2
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m2.players, '[]'::jsonb)) AS elem
    JOIN players p ON p.id = (elem->>'id')::UUID
    WHERE m2.id = v_match_id
      AND (elem->>'id')::UUID <> v_player_id;

    RETURN jsonb_build_object(
      'kind', 'match',
      'match_id', v_match_id,
      'player_id', v_player_id,
      'training_date', v_session_date,
      'theme', v_theme,
      'player_name', v_player_name,
      'teammates', v_teammates
    );
  END IF;
END;
$$;

-- ── 3. submit_training_feedback : + vote MVP obligatoire pour un match ───────
-- Nouvel overload à 7 arguments (p_mvp_vote_player_id en dernier, DEFAULT NULL) :
-- CREATE OR REPLACE FUNCTION avec une liste d'arguments différente crée une
-- fonction distincte plutôt que de remplacer la précédente (déjà rencontré avec
-- p_comment, cf. commentaire plus bas) — l'ancienne signature à 6 arguments doit
-- donc être explicitement refermée, pas seulement la nouvelle sécurisée.
CREATE OR REPLACE FUNCTION submit_training_feedback(
  p_token               TEXT,
  p_auto_evaluation     SMALLINT,
  p_rpe                 SMALLINT,
  p_physical_form       SMALLINT,
  p_pleasure            SMALLINT,
  p_comment             TEXT DEFAULT NULL,
  p_mvp_vote_player_id  UUID DEFAULT NULL
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
  v_candidate_ok BOOLEAN;
  v_total_tokens INT;
  v_used_tokens  INT;
  v_mvp_ids      UUID[];
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

  IF v_match_id IS NOT NULL THEN
    IF p_mvp_vote_player_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'mvp_vote_required');
    END IF;
    IF p_mvp_vote_player_id = v_player_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'mvp_vote_self');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM matches m
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
      WHERE m.id = v_match_id AND (elem->>'id')::UUID = p_mvp_vote_player_id
    ) INTO v_candidate_ok;

    IF NOT v_candidate_ok THEN
      RETURN jsonb_build_object('success', false, 'error', 'mvp_vote_invalid_candidate');
    END IF;
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

    INSERT INTO match_mvp_votes (match_id, voter_player_id, voted_player_id)
    VALUES (v_match_id, v_player_id, p_mvp_vote_player_id)
    ON CONFLICT (match_id, voter_player_id) DO UPDATE SET
      voted_player_id = EXCLUDED.voted_player_id,
      created_at      = NOW();
  END IF;

  UPDATE training_feedback_tokens
  SET used_at = NOW()
  WHERE token = p_token;

  IF p_comment IS NOT NULL AND trim(p_comment) <> '' THEN
    INSERT INTO player_events (player_id, event_type, event_date, report)
    VALUES (v_player_id, 'feedback', CURRENT_DATE, trim(p_comment));
  END IF;

  -- MVP calculé seulement une fois que tous les tokens émis pour ce match sont
  -- utilisés (jamais sur un classement partiel). Recalculé à chaque complétion
  -- pour rester idempotent si des tokens sont régénérés après coup.
  IF v_match_id IS NOT NULL THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE used_at IS NOT NULL)
      INTO v_total_tokens, v_used_tokens
    FROM training_feedback_tokens
    WHERE match_id = v_match_id;

    IF v_total_tokens > 0 AND v_used_tokens = v_total_tokens THEN
      SELECT array_agg(voted_player_id) INTO v_mvp_ids
      FROM (
        SELECT voted_player_id, COUNT(*) AS votes
        FROM match_mvp_votes
        WHERE match_id = v_match_id
        GROUP BY voted_player_id
      ) tally
      WHERE votes = (
        SELECT MAX(votes) FROM (
          SELECT COUNT(*) AS votes FROM match_mvp_votes WHERE match_id = v_match_id GROUP BY voted_player_id
        ) m
      );

      UPDATE matches SET mvp_player_ids = v_mvp_ids, mvp_computed_at = NOW() WHERE id = v_match_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT, UUID) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT, UUID) TO authenticated;

-- L'ancienne signature à 6 arguments reste un objet distinct dans pg_proc après
-- le CREATE OR REPLACE ci-dessus (nouvelle arité = nouvelle fonction, pas un
-- remplacement) : elle garde les GRANT anon/authenticated de la migration
-- précédente tant qu'on ne les referme pas explicitement ici.
REVOKE ALL ON FUNCTION submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 4. get_match_mvp_votes : classement des votes, vue staff ─────────────────
CREATE OR REPLACE FUNCTION get_match_mvp_votes(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id      UUID;
  v_total_tokens INT;
  v_used_tokens  INT;
  v_mvp_ids      UUID[];
  v_ranking      JSONB;
BEGIN
  SELECT team_id, mvp_player_ids INTO v_team_id, v_mvp_ids FROM matches WHERE id = p_match_id;

  IF v_team_id IS NULL OR NOT has_team_access(v_team_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE used_at IS NOT NULL)
    INTO v_total_tokens, v_used_tokens
  FROM training_feedback_tokens
  WHERE match_id = p_match_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'player_id', p.id,
      'player_name', p.first_name || ' ' || p.last_name,
      'votes', v.votes
    ) ORDER BY v.votes DESC, p.first_name, p.last_name
  ), '[]'::jsonb)
  INTO v_ranking
  FROM (
    SELECT voted_player_id, COUNT(*) AS votes
    FROM match_mvp_votes
    WHERE match_id = p_match_id
    GROUP BY voted_player_id
  ) v
  JOIN players p ON p.id = v.voted_player_id;

  RETURN jsonb_build_object(
    'ranking', v_ranking,
    'total_voters', COALESCE(v_total_tokens, 0),
    'voted_count', COALESCE(v_used_tokens, 0),
    'is_complete', v_total_tokens > 0 AND v_used_tokens = v_total_tokens,
    'mvp_player_ids', COALESCE(to_jsonb(v_mvp_ids), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION get_match_mvp_votes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_match_mvp_votes(UUID) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_leak TEXT;
BEGIN
  SELECT string_agg(p.proname || '/' || p.pronargs, ', ') INTO v_leak
  FROM pg_proc p
  WHERE p.proname IN (
    'get_match_mvp_votes','get_feedback_session_by_token','submit_training_feedback'
  )
  AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions vote MVP encore exécutables par PUBLIC : %', v_leak;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'submit_training_feedback' AND pronargs = 6
      AND (has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'submit_training_feedback (6 arguments, sans vote MVP) encore appelable — devrait être refermée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'mvp_player_ids'
  ) THEN
    RAISE EXCEPTION 'matches.mvp_player_ids aurait dû être créée par cette migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'match_mvp_votes'
  ) THEN
    RAISE EXCEPTION 'match_mvp_votes aurait dû être créée par cette migration';
  END IF;
END;
$verify$;
