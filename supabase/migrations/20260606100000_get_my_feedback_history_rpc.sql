-- RPC : historique des feedbacks pour le joueur connecté
-- Nécessaire car la RLS de training_player_feedback utilise has_club_access()
-- qui ne couvre que les coachs — les joueurs ne peuvent pas lire leurs propres feedbacks
-- via une requête directe.
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
          'training_id',    tpf.training_id,
          'date',           tr.date,
          'auto_evaluation', tpf.auto_evaluation,
          'rpe',            tpf.rpe,
          'physical_form',  tpf.physical_form,
          'pleasure',       tpf.pleasure
        )
        ORDER BY tr.date ASC
      )
      FROM training_player_feedback tpf
      JOIN trainings tr ON tr.id = tpf.training_id
      WHERE tpf.player_id = v_player_id
    ),
    '[]'::JSONB
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_feedback_history() TO authenticated;
