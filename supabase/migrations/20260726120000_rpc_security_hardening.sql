-- ============================================================================
-- Durcissement sécurité des RPC SECURITY DEFINER — audit du 2026-07-26.
-- Corrige des fuites d'isolation inter-clubs sur des fonctions SECURITY DEFINER
-- accessibles aux utilisateurs authentifiés.
--
-- 1. get_shared_content_analytics(p_team_id) : ajoute la garde d'accès manquante.
--    Avant ce correctif, tout authentifié pouvait lire les analytics de vues
--    (identités des joueurs + horodatages) de n'importe quelle équipe en
--    devinant/énumérant un team_id.
-- 2. get_team_players(p_team_id) / get_player_teams(p_player_id) : fonctions
--    legacy (2025-01) SECURITY DEFINER sans aucun contrôle d'accès, non
--    utilisées par l'app ni référencées dans le schéma. On retire l'exposition.
-- ============================================================================

-- ── 1. Garde d'accès sur les analytics de contenu partagé ────────────────────
CREATE OR REPLACE FUNCTION public.get_shared_content_analytics(p_team_id UUID)
RETURNS TABLE(
  content_id    UUID,
  content_title TEXT,
  content_type  TEXT,
  folder_name   TEXT,
  player_id     UUID,
  player_name   TEXT,
  viewed_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Garde : l'appelant doit avoir accès à l'équipe (admin du club OU coach de
  -- l'équipe). has_team_access résout le club de l'équipe et vérifie auth.uid().
  IF NOT has_team_access(p_team_id) THEN
    RAISE EXCEPTION 'Accès refusé : vous n''avez pas les droits sur cette équipe.';
  END IF;

  RETURN QUERY
  SELECT
    sc.id                                          AS content_id,
    sc.title::TEXT                                 AS content_title,
    sc.content_type::TEXT,
    scf.name::TEXT                                 AS folder_name,
    p.id                                           AS player_id,
    (p.first_name || ' ' || p.last_name)::TEXT     AS player_name,
    v.viewed_at
  FROM shared_content sc
  LEFT JOIN shared_content_views  v   ON v.content_id = sc.id
  LEFT JOIN players               p   ON p.id = v.player_id
  LEFT JOIN shared_content_folders scf ON scf.id = sc.folder_id
  WHERE sc.team_id = p_team_id
  ORDER BY sc.created_at DESC, v.viewed_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_content_analytics(UUID) TO authenticated;

-- ── 2. Legacy non gardées : couper l'exposition PostgREST ────────────────────
-- Aucune référence dans l'app (web/mobile) ni dans le reste du schéma.
-- On retire EXECUTE de PUBLIC et des rôles PostgREST (anon, authenticated).
-- NB : ne pas DROP tant qu'une vérification sur la DB de prod n'a pas confirmé
-- l'absence de dépendance ; REVOKE ferme l'accès sans risque de rupture.
REVOKE ALL ON FUNCTION get_team_players(UUID)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_player_teams(UUID)  FROM PUBLIC, anon, authenticated;
