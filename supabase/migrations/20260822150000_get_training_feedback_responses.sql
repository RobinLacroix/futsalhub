-- RPC : réponses au questionnaire pour une séance, staff uniquement.
--
-- N'existait nulle part : `get_feedback_session_by_token` sert la page joueur (anon, un
-- seul token), `get_my_feedback_history` sert le joueur connecté sur son propre historique.
-- Aucune des deux ne permet au staff de voir, séance par séance, qui a répondu et quoi.
--
-- Inclut nativement les joueurs invités d'une autre équipe (convoked_players) : la garde
-- est has_team_access(tr.team_id) — l'équipe de la SÉANCE, pas celle du joueur — donc un
-- joueur d'une autre équipe qui répond au questionnaire de cette séance apparaît, marqué
-- is_guest. C'est aussi la garde déjà en place sur training_player_feedback (RLS,
-- 20250222000001), rien à changer côté sécurité.
--
-- Limite connue, signalée sans la corriger ici (hors scope) : le commentaire libre est
-- stocké dans player_events (event_type='feedback'), qui n'a pas de colonne training_id —
-- submit_training_feedback l'écrit avec event_date = CURRENT_DATE (date de soumission, pas
-- forcément celle de la séance si le lien est rempli en différé). Le rattachement ci-dessous
-- se fait donc par player_id + event_date = date de la séance : fiable dans l'immense
-- majorité des cas (questionnaire rempli le jour même), mais peut rater ou mal attribuer un
-- commentaire si un joueur a deux séances le même jour, ou remplit en retard. À corriger
-- proprement (ajouter player_events.training_id) si ça devient gênant en usage réel.
CREATE OR REPLACE FUNCTION get_training_feedback_responses(p_training_id UUID)
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
   AND pe.event_date = tr.date::date
  WHERE f.training_id = p_training_id
    AND has_team_access(tr.team_id);
$$;

REVOKE ALL ON FUNCTION get_training_feedback_responses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_training_feedback_responses(UUID) TO authenticated;
