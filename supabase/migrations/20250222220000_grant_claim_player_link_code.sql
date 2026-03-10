-- Permettre à tout utilisateur connecté de lier son compte avec un code (écran Rejoindre le club)
GRANT EXECUTE ON FUNCTION claim_player_link_code(TEXT) TO authenticated;
