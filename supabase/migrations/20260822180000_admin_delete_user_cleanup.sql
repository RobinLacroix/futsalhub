-- Suppression d'un utilisateur depuis le dashboard Supabase (API admin GoTrue) : échoue
-- avec un 500 générique, sans message exploitable dans les logs. Cause identifiée en
-- interrogeant pg_constraint (claude_audit) : l'API admin fait un DELETE brut sur
-- auth.users, sans passer par la logique de nettoyage de delete_own_account
-- (20260817100000). Quatre FK en NO ACTION (confdeltype = 'a', donc bloquantes tant que
-- des lignes existent) pointent vers auth.users(id) :
--   public.users.id, team_posts.author_user_id, team_post_comments.author_user_id,
--   player_availability.updated_by
-- (vérifié exhaustivement : ce sont les 4 seules sur les 24 FK référençant auth.users —
-- toutes les autres sont CASCADE ou SET NULL, cf. requête pg_constraint du 2026-08-22).
--
-- delete_own_account gère déjà ce nettoyage, mais seulement pour l'appelant authentifié
-- (auth.uid()) — inutilisable pour supprimer le compte de QUELQU'UN D'AUTRE depuis le
-- dashboard. Cette fonction fait le même nettoyage pour un user_id arbitraire.
--
-- Volontairement PAS de GRANT à authenticated/anon : jamais destinée à être appelée par
-- l'appli, seulement depuis le SQL Editor (rôle postgres, qui contourne les GRANT). Pas de
-- garde auth.uid() non plus : ça n'aurait aucun sens depuis le SQL Editor, où il n'y a pas
-- de session JWT — la garde réelle est l'absence de GRANT.
--
-- Usage : SELECT admin_delete_user_cleanup('<user-id>'); puis relancer la suppression
-- depuis le dashboard (ou DELETE FROM auth.users WHERE id = '<user-id>' directement).
CREATE OR REPLACE FUNCTION public.admin_delete_user_cleanup(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users_deleted INT;
  v_posts_updated INT;
  v_comments_updated INT;
  v_availability_updated INT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user_id');
  END IF;

  UPDATE team_posts SET author_user_id = NULL WHERE author_user_id = p_user_id;
  GET DIAGNOSTICS v_posts_updated = ROW_COUNT;

  UPDATE team_post_comments SET author_user_id = NULL WHERE author_user_id = p_user_id;
  GET DIAGNOSTICS v_comments_updated = ROW_COUNT;

  UPDATE player_availability SET updated_by = NULL WHERE updated_by = p_user_id;
  GET DIAGNOSTICS v_availability_updated = ROW_COUNT;

  DELETE FROM public.users WHERE id = p_user_id;
  GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'users_deleted', v_users_deleted,
    'team_posts_cleared', v_posts_updated,
    'team_post_comments_cleared', v_comments_updated,
    'player_availability_cleared', v_availability_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_cleanup(UUID) FROM PUBLIC, anon, authenticated;
