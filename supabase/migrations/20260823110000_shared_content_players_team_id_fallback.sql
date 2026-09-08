-- ═════════════════════════════════════════════════════════════════════════════
-- Fix : "Ouvrir" toujours cassé pour les profils non-coach après 20260823100000
--
-- La policy storage corrigée dans 20260823100000 exige une ligne dans
-- `player_teams` pour l'appartenance du joueur à l'équipe du contenu. Or, dans
-- ce projet, la relation joueur-équipe principale passe par `players.team_id`
-- et n'a pas toujours de ligne correspondante dans `player_teams` (données
-- anciennes, joueurs jamais passés par une convocation cross-équipe). C'est un
-- gap déjà rencontré et corrigé pour les convocations/matchs dans
-- 20250222160000_convocations_fallback_players_team_id.sql — jamais repris
-- pour le contenu partagé (get_my_shared_content/folders datent du même jour,
-- 20260609, et n'ont jamais eu ce fallback).
--
-- Un coach (staff, via club_members) n'est pas concerné par cette table :
-- d'où "ça marche pour les coachs, pas pour les autres profils".
--
-- Fix : reprendre le pattern déjà établi (player_teams OU players.team_id)
-- sur les 3 points d'accès concernés : la policy storage SELECT, et les 2 RPC
-- de lecture joueur (même si seule la policy storage explique le symptôme
-- rapporté, les 2 RPC ont exactement le même gap et méritent la même
-- cohérence — un joueur sans ligne player_teams ne verrait sinon aucun
-- contenu du tout dans sa bibliothèque, coach compris).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Storage RLS : ajouter le fallback players.team_id ─────────────────────

DROP POLICY IF EXISTS "shared_content_files_select" ON storage.objects;
CREATE POLICY "shared_content_files_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'shared-content'
    AND (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.user_id = auth.uid() AND cm.club_id = _safe_uuid((storage.foldername(objects.name))[1])
      )
      OR EXISTS (
        SELECT 1 FROM players p
        JOIN teams t ON t.id = p.team_id
        WHERE p.user_id = auth.uid()
          AND t.club_id = _safe_uuid((storage.foldername(objects.name))[1])
          AND ((storage.foldername(objects.name))[2] = 'club' OR p.team_id = _safe_uuid((storage.foldername(objects.name))[2]))
      )
      OR EXISTS (
        SELECT 1 FROM player_teams pt
        JOIN players p ON p.id = pt.player_id
        JOIN teams t  ON t.id = pt.team_id
        WHERE p.user_id = auth.uid()
          AND t.club_id = _safe_uuid((storage.foldername(objects.name))[1])
          AND ((storage.foldername(objects.name))[2] = 'club' OR pt.team_id = _safe_uuid((storage.foldername(objects.name))[2]))
      )
    )
  );

-- ── 2. get_my_shared_content / get_my_shared_folders : même fallback ─────────

CREATE OR REPLACE FUNCTION public.get_my_shared_content()
RETURNS SETOF public.shared_content
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT sc.*
  FROM shared_content sc
  WHERE EXISTS (
    -- Équipe principale (players.team_id), qu'elle ait ou non une ligne player_teams.
    SELECT 1 FROM players p
    JOIN teams t ON t.id = p.team_id
    WHERE p.id = v_player_id
      AND (sc.team_id = p.team_id OR (sc.team_id IS NULL AND sc.club_id = t.club_id))
    UNION ALL
    -- Équipes secondaires / cross-team (player_teams).
    SELECT 1 FROM player_teams pt
    JOIN teams t ON t.id = pt.team_id
    WHERE pt.player_id = v_player_id
      AND (sc.team_id = pt.team_id OR (sc.team_id IS NULL AND sc.club_id = t.club_id))
  )
  ORDER BY sc.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_shared_folders()
RETURNS SETOF public.shared_content_folders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT scf.*
  FROM shared_content_folders scf
  WHERE EXISTS (
    SELECT 1 FROM players p
    JOIN teams t ON t.id = p.team_id
    WHERE p.id = v_player_id
      AND (scf.team_id = p.team_id OR (scf.team_id IS NULL AND scf.club_id = t.club_id))
    UNION ALL
    SELECT 1 FROM player_teams pt
    JOIN teams t ON t.id = pt.team_id
    WHERE pt.player_id = v_player_id
      AND (scf.team_id = pt.team_id OR (scf.team_id IS NULL AND scf.club_id = t.club_id))
  )
  ORDER BY scf.name;
END;
$$;

REVOKE ALL ON FUNCTION get_my_shared_content()  FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_shared_folders()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_shared_content() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_shared_folders() TO authenticated;

-- ── 3. Vérification ────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_qual TEXT;
BEGIN
  SELECT qual::text INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'shared_content_files_select';

  IF v_qual IS NULL OR v_qual NOT ILIKE '%p.team_id%' THEN
    RAISE EXCEPTION 'shared_content_files_select : fallback players.team_id absent apres correction : %', v_qual;
  END IF;
END
$mig$;

COMMIT;
