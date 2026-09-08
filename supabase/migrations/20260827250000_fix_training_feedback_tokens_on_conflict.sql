-- Bug remonté par Robin : « Envoyer les questionnaires » (fin de séance)
-- plante avec « there is no unique or exclusion constraint matching the ON
-- CONFLICT specification ».
--
-- Root cause : 20260827160000_match_feedback_questionnaire.sql a remplacé la
-- contrainte unique simple sur `training_feedback_tokens(training_id,
-- player_id)` par un INDEX UNIQUE PARTIEL (`training_feedback_tokens_training_
-- player_uq ... WHERE training_id IS NOT NULL`, nécessaire pour laisser
-- coexister des lignes match_id sans training_id) — mais
-- `create_feedback_tokens_for_training` a gardé son
-- `ON CONFLICT (training_id, player_id) DO UPDATE` sans le prédicat
-- `WHERE training_id IS NOT NULL`. Un ON CONFLICT doit matcher EXACTEMENT
-- l'index visé, prédicat inclus : sans lui, Postgres ne trouve plus aucune
-- contrainte correspondante et rejette l'upsert. Cassé pour tout le monde
-- depuis l'application de cette migration ce matin, pas une régression de
-- 20260827220000/230000/240000 (elles ne touchent pas cette fonction).
--
-- `create_feedback_tokens_for_match`, écrite dans la même migration, a le bon
-- pattern (`WHERE match_id IS NOT NULL`) — on aligne simplement l'autre dessus.

CREATE OR REPLACE FUNCTION public.create_feedback_tokens_for_training(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_training_id UUID;
  v_team_id     UUID;
  v_inserted    INT := 0;
  v_player_id   TEXT;
  v_status      TEXT;
  v_token       TEXT;
  v_expires     TIMESTAMPTZ;
BEGIN
  SELECT tr.id, tr.team_id INTO v_training_id, v_team_id
  FROM trainings tr
  WHERE tr.id = p_training_id;

  IF v_training_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'training_not_found');
  END IF;

  IF v_team_id IS NULL OR NOT has_team_write_access(v_team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_expires := NOW() + INTERVAL '7 days';

  FOR v_player_id, v_status IN
    SELECT key, value
    FROM jsonb_each_text((
      SELECT COALESCE(attendance, '{}'::jsonb) FROM trainings WHERE id = p_training_id
    ))
  LOOP
    IF v_status IN ('present', 'late') THEN
      v_token := gen_random_uuid()::text;
      INSERT INTO training_feedback_tokens (training_id, player_id, token, expires_at)
      VALUES (p_training_id, v_player_id::uuid, v_token, v_expires)
      ON CONFLICT (training_id, player_id) WHERE training_id IS NOT NULL DO UPDATE
        SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used_at = NULL;
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.create_feedback_tokens_for_training(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_feedback_tokens_for_training(UUID) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_feedback_tokens_for_training'
      AND prosrc ILIKE '%ON CONFLICT (training_id, player_id) WHERE training_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'create_feedback_tokens_for_training devrait matcher l''index partiel après cette migration';
  END IF;

  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'create_feedback_tokens_for_training'), 'EXECUTE') THEN
    RAISE EXCEPTION 'create_feedback_tokens_for_training est exécutable par PUBLIC après cette migration';
  END IF;
END;
$verify$;
