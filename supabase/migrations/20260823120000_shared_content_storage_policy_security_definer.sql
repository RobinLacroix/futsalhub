-- ═════════════════════════════════════════════════════════════════════════════
-- Fix (le vrai, cette fois) : "Ouvrir" toujours 400 "Object not found" pour
-- les joueurs, malgré 20260823100000 et 20260823110000.
--
-- Confirmé par une simulation exacte du rôle réel (SET LOCAL ROLE authenticated
-- + request.jwt.claim.sub = <uid d'un joueur qui échoue>) : la ligne
-- storage.objects existe bien, mais la policy `shared_content_files_select`
-- renvoie 0 ligne pour ce joueur — contrairement à ce que suggéraient mes deux
-- diagnostics précédents, tous les deux exécutés via une session admin qui
-- contourne le RLS de players/teams et donnait donc un résultat trompeur.
--
-- Cause réelle : la policy fait un JOIN en clair sur `teams` :
--
--   FROM players p JOIN teams t ON t.id = p.team_id
--   WHERE p.user_id = auth.uid() AND t.club_id = ...
--
-- Une policy RLS s'exécute sous le rôle réel de l'appelant (authenticated),
-- PAS en SECURITY DEFINER : toute table qu'elle référence reste soumise à
-- SON PROPRE RLS. Or la policy SELECT de `teams` est :
--
--   (club_id IS NOT NULL) AND has_club_access(club_id)
--
-- et has_club_access() ne vérifie QUE club_members (staff — admin/coach/
-- viewer/medical). Un joueur pur n'y figure jamais : il n'a donc AUCUN accès
-- SELECT direct sur `teams`, pas même sa propre équipe. Le JOIN de la policy
-- storage retombe systématiquement sur 0 ligne pour un joueur, quelle que
-- soit la justesse de la condition d'appartenance en elle-même — d'où le 400
-- "Object not found" (Storage masque un refus RLS en 404-like, cf. échanges
-- précédents), identique pour TOUS les profils joueurs, alors que les coachs
-- passent par la branche club_members qui, elle, n'a jamais ce problème.
--
-- C'est aussi ce qui explique pourquoi log_shared_content_view et
-- get_my_shared_content fonctionnent déjà pour les joueurs : ce sont des
-- fonctions SECURITY DEFINER, qui contournent le RLS des tables qu'elles
-- interrogent en interne (même mécanisme que has_club_access elle-même,
-- qui est SECURITY DEFINER). Une policy RLS n'a pas ce contournement — il
-- faut le lui donner explicitement en déléguant sa condition à une fonction
-- SECURITY DEFINER, exactement le pattern déjà utilisé partout ailleurs dans
-- ce projet pour l'accès joueur (cf. CLAUDE.md, section Sécurité).
--
-- Fix : extraire toute la logique d'autorisation dans une fonction
-- SECURITY DEFINER, et faire pointer la policy dessus.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._can_read_shared_content_object(p_object_name TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club_id UUID := _safe_uuid((storage.foldername(p_object_name))[1]);
  v_team_seg TEXT := (storage.foldername(p_object_name))[2];
BEGIN
  IF v_club_id IS NULL THEN RETURN false; END IF;

  -- Staff (admin/coach/viewer/medical) du club.
  IF EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = v_club_id
  ) THEN
    RETURN true;
  END IF;

  -- Joueur : équipe principale (players.team_id) ou secondaire (player_teams).
  RETURN EXISTS (
    SELECT 1 FROM players p
    JOIN teams t ON t.id = p.team_id
    WHERE p.user_id = auth.uid()
      AND t.club_id = v_club_id
      AND (v_team_seg = 'club' OR p.team_id = _safe_uuid(v_team_seg))
  ) OR EXISTS (
    SELECT 1 FROM player_teams pt
    JOIN players p ON p.id = pt.player_id
    JOIN teams t  ON t.id = pt.team_id
    WHERE p.user_id = auth.uid()
      AND t.club_id = v_club_id
      AND (v_team_seg = 'club' OR pt.team_id = _safe_uuid(v_team_seg))
  );
END;
$$;

REVOKE ALL ON FUNCTION public._can_read_shared_content_object(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._can_read_shared_content_object(TEXT) TO authenticated;

DROP POLICY IF EXISTS "shared_content_files_select" ON storage.objects;
CREATE POLICY "shared_content_files_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'shared-content'
    AND public._can_read_shared_content_object(objects.name)
  );

-- ── Vérification : rejoue la simulation qui a révélé le bug ─────────────────
-- (le compte "Test Test" utilisé pour le diagnostic, cf. échange avec Robin)

DO $mig$
DECLARE
  v_ok boolean;
BEGIN
  -- _can_read_shared_content_object est SECURITY DEFINER : seul auth.uid()
  -- (donc le GUC JWT) importe ici, pas le rôle Postgres courant.
  PERFORM set_config('request.jwt.claim.sub', '20dd06d3-1ce4-4c84-bf6c-7a58f6c9eb76', true);

  SELECT public._can_read_shared_content_object(
    '8f3fdec0-4db7-4f9f-9db2-b8f2e368406a/club/1787236234105-corner-2-BF76D1D4-A7E9-490A-92E9-F51207680E8E.MP4'
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Fix inefficace : _can_read_shared_content_object refuse toujours le compte de test';
  END IF;
END
$mig$;

COMMIT;
