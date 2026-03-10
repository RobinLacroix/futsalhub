-- Permissions pour les RPC espace joueur (appelées par les utilisateurs authentifiés)
GRANT EXECUTE ON FUNCTION get_my_convocations() TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_training_attendance(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_pending_feedback_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_player_team_ids() TO authenticated;
