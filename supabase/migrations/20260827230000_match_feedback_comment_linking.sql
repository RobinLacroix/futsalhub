-- Demande : le commentaire libre d'un questionnaire de MATCH doit apparaître
-- sur la fiche match (TrainingFeedbackResponsesSheet), comme c'est déjà le
-- cas pour un entraînement.
--
-- Root cause, déjà documentée (mais pas corrigée) dans le commentaire de
-- 20260822150000_get_training_feedback_responses.sql : le commentaire libre
-- est stocké dans `player_events` (event_type='feedback'), une table qui n'a
-- pas de colonne training_id/match_id. Le rattachement se faisait par
-- `player_id + event_date = date de la séance` — hypothèse qui tient pour un
-- entraînement (questionnaire rempli le jour même dans l'immense majorité des
-- cas), mais casse pour un match : le lien de questionnaire est fréquemment
-- rempli le lendemain (match en soirée/week-end), donc
-- `submit_training_feedback` écrit `event_date = CURRENT_DATE` (date de
-- soumission) qui ne correspond alors plus à `matches.date`, et le commentaire
-- ne matche plus rien.
--
-- Fix définitif plutôt que patch de la date : `player_events` gagne deux
-- colonnes nullables `training_id`/`match_id`, renseignées par
-- `submit_training_feedback` au moment de l'insertion (lien exact, plus de
-- pari sur la date). Les deux RPC de lecture staff matchent en priorité sur
-- l'id ; l'ancienne heuristique par date reste en repli UNIQUEMENT pour les
-- lignes historiques (les deux colonnes NULL) — aucune régression sur les
-- commentaires d'entraînement déjà enregistrés.

ALTER TABLE public.player_events
  ADD COLUMN IF NOT EXISTS training_id UUID REFERENCES public.trainings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_id    UUID REFERENCES public.matches(id)   ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_events_training_or_match_check'
  ) THEN
    ALTER TABLE public.player_events
      ADD CONSTRAINT player_events_training_or_match_check
      CHECK (training_id IS NULL OR match_id IS NULL);
  END IF;
END;
$$;

-- ── submit_training_feedback : renseigne le lien exact ────────────────────────
CREATE OR REPLACE FUNCTION public.submit_training_feedback(
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
SET search_path TO 'public'
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
    INSERT INTO player_events (player_id, event_type, event_date, report, training_id, match_id)
    VALUES (v_player_id, 'feedback', CURRENT_DATE, trim(p_comment), v_training_id, v_match_id);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grants inchangés (anon ET authenticated, déjà les deux en prod) : CREATE OR
-- REPLACE ne les modifie pas, on ne fait que réaffirmer l'état existant.
REVOKE ALL ON FUNCTION public.submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_training_feedback(TEXT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT) TO anon, authenticated;

-- ── get_training_feedback_responses : lien exact, repli date si legacy ───────
CREATE OR REPLACE FUNCTION public.get_training_feedback_responses(p_training_id UUID)
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
      'is_guest', (p.team_id IS DISTINCT FROM tr.team_id),
      'auto_evaluation', f.auto_evaluation,
      'rpe', f.rpe,
      'physical_form', f.physical_form,
      'pleasure', f.pleasure,
      'submitted_at', f.updated_at,
      'comment', pe.report
    ) ORDER BY p.first_name, p.last_name
  ), '[]'::jsonb)
  FROM training_player_feedback f
  JOIN trainings tr ON tr.id = f.training_id
  JOIN players p ON p.id = f.player_id
  LEFT JOIN teams tm ON tm.id = p.team_id
  LEFT JOIN player_events pe
    ON pe.player_id = f.player_id
   AND pe.event_type = 'feedback'
   AND (
     pe.training_id = f.training_id
     OR (pe.training_id IS NULL AND pe.match_id IS NULL AND pe.event_date = tr.date::date)
   )
  WHERE f.training_id = p_training_id
    AND has_team_access(tr.team_id);
$$;

REVOKE ALL ON FUNCTION public.get_training_feedback_responses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_feedback_responses(UUID) TO authenticated;

-- ── get_match_feedback_responses : idem côté match ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_match_feedback_responses(p_match_id UUID)
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
   AND (
     pe.match_id = f.match_id
     OR (pe.training_id IS NULL AND pe.match_id IS NULL AND pe.event_date = m.date::date)
   )
  WHERE f.match_id = p_match_id
    AND has_team_access(m.team_id);
$$;

REVOKE ALL ON FUNCTION public.get_match_feedback_responses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_match_feedback_responses(UUID) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_leak TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'player_events' AND column_name = 'match_id'
  ) THEN
    RAISE EXCEPTION 'player_events.match_id aurait dû être créée par cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'player_events' AND column_name = 'training_id'
  ) THEN
    RAISE EXCEPTION 'player_events.training_id aurait dû être créée par cette migration';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  WHERE p.proname IN ('get_training_feedback_responses', 'get_match_feedback_responses')
  AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions réponses questionnaire encore exécutables par PUBLIC : %', v_leak;
  END IF;

  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'submit_training_feedback' AND pronargs = 6), 'EXECUTE') THEN
    RAISE EXCEPTION 'submit_training_feedback (6 args) est exécutable par PUBLIC après cette migration';
  END IF;
  IF NOT has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = 'submit_training_feedback' AND pronargs = 6), 'EXECUTE') THEN
    RAISE EXCEPTION 'submit_training_feedback (6 args) devrait rester exécutable par anon (surface assumée, token = secret)';
  END IF;
  IF NOT has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname = 'submit_training_feedback' AND pronargs = 6), 'EXECUTE') THEN
    RAISE EXCEPTION 'submit_training_feedback (6 args) devrait rester exécutable par authenticated (comportement inchangé)';
  END IF;
END;
$verify$;
