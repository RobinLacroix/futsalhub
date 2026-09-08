-- ═════════════════════════════════════════════════════════════════════════════
-- Fix : share_video_to_feed casse en silence pour un contenu partagé
-- "à toutes les équipes du club" (Partage → toggle shareToAllTeams), signalé
-- par Robin ("le partage ne fonctionne plus").
--
-- Même bug que log_shared_content_view, déjà corrigé le 2026-08-23
-- (20260823100000) : share_video_to_feed (20260814170000_team_feed_v2.sql)
-- porte encore le corps d'avant le rollout club-wide (20260817100000), qui a
-- rendu shared_content.team_id nullable — team_id IS NULL signifie désormais
-- "partagé à tout le club", pas "introuvable". La fonction fait :
--
--   SELECT team_id, title, url INTO v_team_id, ... FROM shared_content ...
--   IF v_team_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
--
-- Elle sort donc en échec dès qu'un coach partage un contenu club-wide dans le
-- fil — silencieusement côté UI, l'appel étant `void`-é dans
-- mobile/app/(tabs)/share/index.tsx (corrigé dans le même lot pour remonter
-- l'erreur au lieu de l'avaler).
--
-- Fix : team_posts exige un team_id (pas de concept club-wide côté fil), donc
-- un contenu club-wide poste UN feed par équipe du club, comme s'il avait été
-- partagé individuellement à chacune. Même garde d'accès que la policy INSERT
-- de shared_content (20260817100000) : has_team_write_access si team-scopé,
-- is_club_admin si club-wide.
--
-- Au passage : ajoute la notification push aux joueurs (type 'content_shared'),
-- qui n'existait pour aucun cas jusqu'ici — seul le post de fil existait, sans
-- notif. Même pipeline que planning_published (20260823130000).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION share_video_to_feed(p_shared_content_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id       UUID;
  v_club_id       UUID;
  v_title         TEXT;
  v_url           TEXT;
  v_post_id       UUID;
  v_first_post_id UUID;
  v_target_team   RECORD;
  v_player        RECORD;
BEGIN
  SELECT team_id, club_id, title, url INTO v_team_id, v_club_id, v_title, v_url
  FROM shared_content WHERE id = p_shared_content_id;

  IF v_club_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_team_id IS NOT NULL THEN
    IF NOT has_team_write_access(v_team_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;
  ELSE
    IF NOT is_club_admin(v_club_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;
  END IF;

  FOR v_target_team IN
    SELECT id FROM teams
    WHERE (v_team_id IS NOT NULL AND id = v_team_id)
       OR (v_team_id IS NULL AND club_id = v_club_id)
  LOOP
    INSERT INTO team_posts (team_id, author_user_id, content, post_type, link_url)
    VALUES (v_target_team.id, auth.uid(), 'Nouvelle vidéo : ' || v_title, 'video', v_url)
    RETURNING id INTO v_post_id;

    IF v_first_post_id IS NULL THEN
      v_first_post_id := v_post_id;
    END IF;

    FOR v_player IN
      SELECT DISTINCT p.user_id
      FROM players p
      LEFT JOIN player_teams pt ON pt.player_id = p.id
      WHERE (p.team_id = v_target_team.id OR pt.team_id = v_target_team.id)
        AND p.status = 'active'
        AND p.user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_player.user_id, 'content_shared',
        'Nouveau contenu partagé',
        v_title,
        jsonb_build_object('type', 'content_shared', 'team_id', v_target_team.id::text, 'post_id', v_post_id::text)
      );
    END LOOP;
  END LOOP;

  IF v_first_post_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_target_team');
  END IF;

  RETURN jsonb_build_object('success', true, 'post_id', v_first_post_id);
END;
$$;

REVOKE ALL ON FUNCTION share_video_to_feed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION share_video_to_feed(UUID) TO authenticated;

-- ── Vérification : la fonction reste inaccessible à PUBLIC ────────────────────
DO $mig$
BEGIN
  IF has_function_privilege('public', 'share_video_to_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'share_video_to_feed encore exécutable par PUBLIC après migration.';
  END IF;
  RAISE NOTICE 'OK : share_video_to_feed gère le partage club-wide, notif content_shared branchée.';
END
$mig$;
