-- Permettre aux utilisateurs authentifiés d'appeler create_user_club
GRANT EXECUTE ON FUNCTION create_user_club(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_club(UUID, TEXT) TO service_role;
