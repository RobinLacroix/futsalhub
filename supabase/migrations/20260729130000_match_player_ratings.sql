-- Système d'évaluation de match — Volet B (note data joueur de champ).
-- Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md
--
-- Calcule une note /10 par joueur de CHAMP à partir de match_events, jamais figée en base
-- (recalculée à la demande). Note = base 5.0 + composante individuelle (portée par player_id)
-- + composante collective (éclatée sur les joueurs présents dans players_on_field de chaque event).
-- Clamp strict [0.0 ; 10.0], arrondi 1 décimale. Gardiens exclus (barème v1).
-- Barème figé en dur ici ; la personnalisation par coach est repoussée en v2.

CREATE OR REPLACE FUNCTION get_match_player_ratings(p_match_id UUID)
RETURNS TABLE (
  player_id   UUID,
  player_name TEXT,
  rating      NUMERIC,
  indiv_pts   NUMERIC,
  coll_pts    NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_club_id UUID;
  -- Échelle de notation (poids) du club, avec fallback sur les défauts standards.
  v_w_goal NUMERIC; v_w_assist NUMERIC; v_w_recovery NUMERIC; v_w_shot_on_target NUMERIC;
  v_w_shot NUMERIC; v_w_ball_loss NUMERIC; v_w_yellow_card NUMERIC; v_w_red_card NUMERIC;
  v_cw_goal NUMERIC; v_cw_shot NUMERIC; v_cw_opponent_shot NUMERIC; v_cw_opponent_goal NUMERIC;
BEGIN
  -- Résolution club + garde d'accès (même schéma que insert_match_event).
  SELECT m.team_id, t.club_id
    INTO v_team_id, v_club_id
  FROM matches m
  LEFT JOIN teams t ON t.id = m.team_id
  WHERE m.id = p_match_id;

  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id) THEN
    RAISE EXCEPTION 'Match introuvable';
  END IF;

  IF v_club_id IS NULL OR NOT has_club_access(v_club_id) THEN
    RAISE EXCEPTION 'Accès refusé: vous n''avez pas les droits sur ce club';
  END IF;

  -- Échelle du club (ligne absente => défauts standards).
  SELECT
    COALESCE(w.w_goal, 0.8), COALESCE(w.w_assist, 0.4), COALESCE(w.w_recovery, 0.3),
    COALESCE(w.w_shot_on_target, 0.1), COALESCE(w.w_shot, 0.05), COALESCE(w.w_ball_loss, -0.3),
    COALESCE(w.w_yellow_card, -0.2), COALESCE(w.w_red_card, -0.7),
    COALESCE(w.cw_goal, 0.2), COALESCE(w.cw_shot, 0.05),
    COALESCE(w.cw_opponent_shot, -0.05), COALESCE(w.cw_opponent_goal, -0.2)
  INTO
    v_w_goal, v_w_assist, v_w_recovery, v_w_shot_on_target, v_w_shot, v_w_ball_loss,
    v_w_yellow_card, v_w_red_card, v_cw_goal, v_cw_shot, v_cw_opponent_shot, v_cw_opponent_goal
  FROM (SELECT v_club_id AS cid) s
  LEFT JOIN match_rating_weights w ON w.club_id = s.cid;

  RETURN QUERY
  WITH ev AS (
    SELECT e.event_type, e.player_id, e.players_on_field
    FROM match_events e
    WHERE e.match_id = p_match_id
  ),
  -- Composante individuelle : portée par le player_id de l'event.
  indiv AS (
    SELECT ev.player_id, SUM(
      CASE ev.event_type
        WHEN 'goal'           THEN v_w_goal
        WHEN 'assist'         THEN v_w_assist
        WHEN 'recovery'       THEN v_w_recovery
        WHEN 'shot_on_target' THEN v_w_shot_on_target
        WHEN 'shot'           THEN v_w_shot
        WHEN 'ball_loss'      THEN v_w_ball_loss
        WHEN 'yellow_card'    THEN v_w_yellow_card
        WHEN 'red_card'       THEN v_w_red_card
        ELSE 0.0
      END
    ) AS pts
    FROM ev
    WHERE ev.player_id IS NOT NULL
    GROUP BY ev.player_id
  ),
  -- Composante collective : éclatée sur chaque joueur présent au moment de l'event.
  collective AS (
    SELECT (pid.value)::uuid AS player_id, SUM(
      CASE ev.event_type
        WHEN 'goal'                    THEN v_cw_goal
        WHEN 'shot'                    THEN v_cw_shot
        WHEN 'shot_on_target'          THEN v_cw_shot
        WHEN 'opponent_goal'           THEN v_cw_opponent_goal
        WHEN 'opponent_shot'           THEN v_cw_opponent_shot
        WHEN 'opponent_shot_on_target' THEN v_cw_opponent_shot
        ELSE 0.0
      END
    ) AS pts
    FROM ev
    CROSS JOIN LATERAL jsonb_array_elements_text(ev.players_on_field) AS pid(value)
    GROUP BY (pid.value)::uuid
  ),
  -- Joueurs ayant effectivement participé (apparus sur le terrain sur au moins un event).
  played AS (
    SELECT DISTINCT (pid.value)::uuid AS player_id
    FROM ev
    CROSS JOIN LATERAL jsonb_array_elements_text(ev.players_on_field) AS pid(value)
  )
  SELECT
    p.id AS player_id,
    (p.first_name || ' ' || p.last_name)::text AS player_name,
    ROUND(LEAST(10.0, GREATEST(0.0, 5.0 + COALESCE(i.pts, 0) + COALESCE(c.pts, 0)))::numeric, 1) AS rating,
    ROUND(COALESCE(i.pts, 0)::numeric, 2) AS indiv_pts,
    ROUND(COALESCE(c.pts, 0)::numeric, 2) AS coll_pts
  FROM players p
  JOIN played pl ON pl.player_id = p.id
  LEFT JOIN indiv i      ON i.player_id = p.id
  LEFT JOIN collective c ON c.player_id = p.id
  WHERE LOWER(COALESCE(p.position, '')) <> 'gardien'
  ORDER BY rating DESC, p.last_name, p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_player_ratings(UUID) TO authenticated;

COMMENT ON FUNCTION get_match_player_ratings(UUID) IS
  'Note data /10 par joueur de champ pour un match (base 5, indiv + collectif, clamp 0-10). Voir SPEC_EVALUATION_MATCH_2026-07.md.';
