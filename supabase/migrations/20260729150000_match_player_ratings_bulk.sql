-- Système d'évaluation de match — Volet B, version set-based multi-matchs.
-- Spec : livrables/futsalhub/SPEC_EVALUATION_MATCH_2026-07.md (§11.4/11.5)
--
-- Même logique de note que get_match_player_ratings, mais sur un lot de matchs en une seule
-- requête (évite le N+1 côté analytics / courbe page joueur). Le frontend agrège ensuite :
--   - analytics : AVG(rating) par joueur ;
--   - page joueur : série ordonnée par date pour un player_id.
-- Ne renvoie que les matchs des clubs auxquels l'appelant a accès (filtre, pas d'exception),
-- pour rester robuste sur un lot hétérogène.

CREATE OR REPLACE FUNCTION get_match_player_ratings_bulk(p_match_ids UUID[])
RETURNS TABLE (
  match_id    UUID,
  match_date  TIMESTAMPTZ,
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
BEGIN
  RETURN QUERY
  WITH allowed AS (
    -- Matchs demandés, restreints à ceux dont le club est accessible à l'appelant.
    SELECT m.id, m.date, t.club_id
    FROM matches m
    JOIN teams t ON t.id = m.team_id
    WHERE m.id = ANY(p_match_ids)
      AND has_club_access(t.club_id)
  ),
  -- Échelle de notation résolue par match (via le club), fallback sur les défauts standards.
  wt AS (
    SELECT
      a.id AS match_id,
      COALESCE(mw.w_goal, 0.8) AS w_goal, COALESCE(mw.w_assist, 0.4) AS w_assist,
      COALESCE(mw.w_recovery, 0.3) AS w_recovery, COALESCE(mw.w_shot_on_target, 0.1) AS w_shot_on_target,
      COALESCE(mw.w_shot, 0.05) AS w_shot, COALESCE(mw.w_ball_loss, -0.3) AS w_ball_loss,
      COALESCE(mw.w_yellow_card, -0.2) AS w_yellow_card, COALESCE(mw.w_red_card, -0.7) AS w_red_card,
      COALESCE(mw.cw_goal, 0.2) AS cw_goal, COALESCE(mw.cw_shot, 0.05) AS cw_shot,
      COALESCE(mw.cw_opponent_shot, -0.05) AS cw_opponent_shot, COALESCE(mw.cw_opponent_goal, -0.2) AS cw_opponent_goal
    FROM allowed a
    LEFT JOIN match_rating_weights mw ON mw.club_id = a.club_id
  ),
  ev AS (
    SELECT e.match_id, e.event_type, e.player_id, e.players_on_field
    FROM match_events e
    JOIN allowed a ON a.id = e.match_id
  ),
  indiv AS (
    SELECT ev.match_id, ev.player_id, SUM(
      CASE ev.event_type
        WHEN 'goal'           THEN w.w_goal
        WHEN 'assist'         THEN w.w_assist
        WHEN 'recovery'       THEN w.w_recovery
        WHEN 'shot_on_target' THEN w.w_shot_on_target
        WHEN 'shot'           THEN w.w_shot
        WHEN 'ball_loss'      THEN w.w_ball_loss
        WHEN 'yellow_card'    THEN w.w_yellow_card
        WHEN 'red_card'       THEN w.w_red_card
        ELSE 0.0
      END
    ) AS pts
    FROM ev
    JOIN wt w ON w.match_id = ev.match_id
    WHERE ev.player_id IS NOT NULL
    GROUP BY ev.match_id, ev.player_id
  ),
  collective AS (
    SELECT ev.match_id, (pid.value)::uuid AS player_id, SUM(
      CASE ev.event_type
        WHEN 'goal'                    THEN w.cw_goal
        WHEN 'shot'                    THEN w.cw_shot
        WHEN 'shot_on_target'          THEN w.cw_shot
        WHEN 'opponent_goal'           THEN w.cw_opponent_goal
        WHEN 'opponent_shot'           THEN w.cw_opponent_shot
        WHEN 'opponent_shot_on_target' THEN w.cw_opponent_shot
        ELSE 0.0
      END
    ) AS pts
    FROM ev
    JOIN wt w ON w.match_id = ev.match_id
    CROSS JOIN LATERAL jsonb_array_elements_text(ev.players_on_field) AS pid(value)
    GROUP BY ev.match_id, (pid.value)::uuid
  ),
  played AS (
    SELECT DISTINCT ev.match_id, (pid.value)::uuid AS player_id
    FROM ev
    CROSS JOIN LATERAL jsonb_array_elements_text(ev.players_on_field) AS pid(value)
  )
  SELECT
    a.id AS match_id,
    a.date AS match_date,
    p.id AS player_id,
    (p.first_name || ' ' || p.last_name)::text AS player_name,
    ROUND(LEAST(10.0, GREATEST(0.0, 5.0 + COALESCE(i.pts, 0) + COALESCE(c.pts, 0)))::numeric, 1) AS rating,
    ROUND(COALESCE(i.pts, 0)::numeric, 2) AS indiv_pts,
    ROUND(COALESCE(c.pts, 0)::numeric, 2) AS coll_pts
  FROM allowed a
  JOIN played pl        ON pl.match_id = a.id
  JOIN players p        ON p.id = pl.player_id
  LEFT JOIN indiv i     ON i.match_id = a.id AND i.player_id = p.id
  LEFT JOIN collective c ON c.match_id = a.id AND c.player_id = p.id
  WHERE LOWER(COALESCE(p.position, '')) <> 'gardien'
  ORDER BY a.date, rating DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_match_player_ratings_bulk(UUID[]) TO authenticated;

COMMENT ON FUNCTION get_match_player_ratings_bulk(UUID[]) IS
  'Notes data /10 par joueur de champ sur un lot de matchs (set-based, pour analytics moyenne + courbe page joueur). Voir SPEC_EVALUATION_MATCH_2026-07.md.';
