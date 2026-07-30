-- Système d'évaluation de match — échelle de notation personnalisable (par club).
-- Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
--
-- Une ligne par club. Absence de ligne = échelle par défaut (les DEFAULT ci-dessous).
-- Les RPC de calcul (get_match_player_ratings / _bulk) lisent ces poids via le club du match,
-- avec COALESCE sur les mêmes défauts, de sorte qu'un club sans ligne utilise l'échelle standard.
-- Scope = club (pas par utilisateur) : une note de match doit être identique pour tout le staff.

CREATE TABLE IF NOT EXISTS match_rating_weights (
  club_id UUID PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  -- Poids individuels (appliqués au player_id de l'event)
  w_goal            NUMERIC NOT NULL DEFAULT 0.8,
  w_assist          NUMERIC NOT NULL DEFAULT 0.4,
  w_recovery        NUMERIC NOT NULL DEFAULT 0.3,
  w_shot_on_target  NUMERIC NOT NULL DEFAULT 0.1,
  w_shot            NUMERIC NOT NULL DEFAULT 0.05,
  w_ball_loss       NUMERIC NOT NULL DEFAULT -0.3,
  w_yellow_card     NUMERIC NOT NULL DEFAULT -0.2,
  w_red_card        NUMERIC NOT NULL DEFAULT -0.7,
  -- Poids collectifs (appliqués à chaque joueur présent sur le terrain)
  cw_goal           NUMERIC NOT NULL DEFAULT 0.2,
  cw_shot           NUMERIC NOT NULL DEFAULT 0.05,
  cw_opponent_shot  NUMERIC NOT NULL DEFAULT -0.05,
  cw_opponent_goal  NUMERIC NOT NULL DEFAULT -0.2,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE match_rating_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_rating_weights_read ON match_rating_weights
  FOR SELECT USING (has_club_access(club_id));
CREATE POLICY match_rating_weights_insert ON match_rating_weights
  FOR INSERT WITH CHECK (has_club_access(club_id));
CREATE POLICY match_rating_weights_update ON match_rating_weights
  FOR UPDATE USING (has_club_access(club_id)) WITH CHECK (has_club_access(club_id));

COMMENT ON TABLE match_rating_weights IS
  'Échelle de notation personnalisée par club (Volet B). Absence de ligne = échelle par défaut. Voir SPEC_EVALUATION_MATCH_2026-07.md.';

-- ── Lecture : échelle du club de l'appelant, fusionnée avec les défauts ──
CREATE OR REPLACE FUNCTION get_rating_weights()
RETURNS TABLE (
  w_goal NUMERIC, w_assist NUMERIC, w_recovery NUMERIC, w_shot_on_target NUMERIC,
  w_shot NUMERIC, w_ball_loss NUMERIC, w_yellow_card NUMERIC, w_red_card NUMERIC,
  cw_goal NUMERIC, cw_shot NUMERIC, cw_opponent_shot NUMERIC, cw_opponent_goal NUMERIC,
  is_custom BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID := get_user_club_id();
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(m.w_goal, 0.8), COALESCE(m.w_assist, 0.4), COALESCE(m.w_recovery, 0.3),
    COALESCE(m.w_shot_on_target, 0.1), COALESCE(m.w_shot, 0.05), COALESCE(m.w_ball_loss, -0.3),
    COALESCE(m.w_yellow_card, -0.2), COALESCE(m.w_red_card, -0.7),
    COALESCE(m.cw_goal, 0.2), COALESCE(m.cw_shot, 0.05),
    COALESCE(m.cw_opponent_shot, -0.05), COALESCE(m.cw_opponent_goal, -0.2),
    (m.club_id IS NOT NULL) AS is_custom
  FROM (SELECT v_club_id AS cid) s
  LEFT JOIN match_rating_weights m ON m.club_id = s.cid;
END;
$$;

GRANT EXECUTE ON FUNCTION get_rating_weights() TO authenticated;

-- ── Écriture : upsert de l'échelle du club de l'appelant ──
CREATE OR REPLACE FUNCTION set_rating_weights(
  p_w_goal NUMERIC, p_w_assist NUMERIC, p_w_recovery NUMERIC, p_w_shot_on_target NUMERIC,
  p_w_shot NUMERIC, p_w_ball_loss NUMERIC, p_w_yellow_card NUMERIC, p_w_red_card NUMERIC,
  p_cw_goal NUMERIC, p_cw_shot NUMERIC, p_cw_opponent_shot NUMERIC, p_cw_opponent_goal NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID := get_user_club_id();
BEGIN
  IF v_club_id IS NULL OR NOT has_club_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: aucun club actif pour cet utilisateur';
  END IF;

  INSERT INTO match_rating_weights (
    club_id, w_goal, w_assist, w_recovery, w_shot_on_target, w_shot, w_ball_loss,
    w_yellow_card, w_red_card, cw_goal, cw_shot, cw_opponent_shot, cw_opponent_goal, updated_at
  ) VALUES (
    v_club_id, p_w_goal, p_w_assist, p_w_recovery, p_w_shot_on_target, p_w_shot, p_w_ball_loss,
    p_w_yellow_card, p_w_red_card, p_cw_goal, p_cw_shot, p_cw_opponent_shot, p_cw_opponent_goal, now()
  )
  ON CONFLICT (club_id) DO UPDATE SET
    w_goal = EXCLUDED.w_goal, w_assist = EXCLUDED.w_assist, w_recovery = EXCLUDED.w_recovery,
    w_shot_on_target = EXCLUDED.w_shot_on_target, w_shot = EXCLUDED.w_shot, w_ball_loss = EXCLUDED.w_ball_loss,
    w_yellow_card = EXCLUDED.w_yellow_card, w_red_card = EXCLUDED.w_red_card,
    cw_goal = EXCLUDED.cw_goal, cw_shot = EXCLUDED.cw_shot,
    cw_opponent_shot = EXCLUDED.cw_opponent_shot, cw_opponent_goal = EXCLUDED.cw_opponent_goal,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION set_rating_weights(
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC
) TO authenticated;

-- ── Réinitialisation : supprime la ligne du club (retour à l'échelle par défaut) ──
CREATE OR REPLACE FUNCTION reset_rating_weights()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID := get_user_club_id();
BEGIN
  IF v_club_id IS NULL OR NOT has_club_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: aucun club actif pour cet utilisateur';
  END IF;
  DELETE FROM match_rating_weights WHERE club_id = v_club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_rating_weights() TO authenticated;
