-- RPCs pour les badges de notification granulaires (par séance / par joueur)

CREATE OR REPLACE FUNCTION get_unread_absence_training_ids()
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT (data->>'training_id')::UUID),
    ARRAY[]::UUID[]
  )
  FROM notifications
  WHERE user_id = auth.uid()
    AND type = 'absence_report'
    AND read_at IS NULL
    AND data->>'training_id' IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION get_unread_feedback_player_ids()
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    ARRAY_AGG(DISTINCT (data->>'player_id')::UUID),
    ARRAY[]::UUID[]
  )
  FROM notifications
  WHERE user_id = auth.uid()
    AND type = 'feedback_comment'
    AND read_at IS NULL
    AND data->>'player_id' IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION mark_training_absence_read(p_training_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND type = 'absence_report'
    AND data->>'training_id' = p_training_id::text
    AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION mark_player_feedback_read(p_player_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND type = 'feedback_comment'
    AND data->>'player_id' = p_player_id::text
    AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION get_unread_absence_training_ids()   TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_feedback_player_ids()    TO authenticated;
GRANT EXECUTE ON FUNCTION mark_training_absence_read(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION mark_player_feedback_read(UUID)     TO authenticated;
