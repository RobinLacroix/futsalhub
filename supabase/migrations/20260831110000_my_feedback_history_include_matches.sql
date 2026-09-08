-- get_my_feedback_history : le questionnaire post-match n'apparaissait jamais
-- dans l'historique du joueur connecté.
--
-- Depuis `20260827160000_match_feedback_questionnaire.sql`,
-- `training_player_feedback` couvre aussi le feedback de match (`match_id`
-- NOT NULL, `training_id` NULL, CHECK d'exclusivité). Cette fonction faisait
-- un `JOIN trainings` : un INNER JOIN qui excluait silencieusement toute
-- ligne de feedback match. Même bug, même cause, que celui corrigé côté
-- service web/mobile (`getPlayerTrainingFeedback` / `getPlayerFeedbackHistory`)
-- dans la même session.
--
-- Signature inchangée (aucun paramètre) : un simple CREATE OR REPLACE suffit
-- à remplacer la fonction existante, pas de DROP nécessaire.
CREATE OR REPLACE FUNCTION get_my_feedback_history()
RETURNS JSONB
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
    RETURN '[]'::JSONB;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'training_id',     tpf.training_id,
          'match_id',        tpf.match_id,
          'date',            COALESCE(tr.date, m.date),
          'auto_evaluation', tpf.auto_evaluation,
          'rpe',             tpf.rpe,
          'physical_form',   tpf.physical_form,
          'pleasure',        tpf.pleasure
        )
        ORDER BY COALESCE(tr.date, m.date) ASC
      )
      FROM training_player_feedback tpf
      LEFT JOIN trainings tr ON tr.id = tpf.training_id
      LEFT JOIN matches   m  ON m.id  = tpf.match_id
      WHERE tpf.player_id = v_player_id
    ),
    '[]'::JSONB
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_feedback_history() TO authenticated;
