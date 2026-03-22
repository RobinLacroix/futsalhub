-- Permettre le statut 'left' pour les joueurs "supprimés" (soft delete)
-- Ces joueurs restent en base pour préserver les stats des matchs
COMMENT ON COLUMN players.status IS 'active = dans l''effectif, left = sorti du club (masqué Effectif/Dashboard, stats conservées)';
