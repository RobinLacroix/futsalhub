-- Suppression de compte self-service (conformité App Store §5.1.1(v) et Play Store
-- "account deletion" policy — obligation pour toute app avec création de compte).
--
-- Portée : supprime l'identité de connexion (auth.users + public.users) et tout ce qui n'a
-- de sens que rattaché à un compte connecté (adhésions club, invitations créées, tokens push,
-- notifications). Les données sportives (résultats de tests physiques, présences, stats de
-- match) sont rattachées à players.id, pas à auth.users : elles survivent, seul le lien de
-- connexion (players.user_id) est coupé (ON DELETE SET NULL déjà en place sur players). Ce sont
-- des données du club (historique d'équipe), pas des données personnelles de connexion — décision
-- produit assumée, pas un oubli. À revoir si un joueur/coach demande explicitement l'effacement
-- de son historique sportif (droit RGPD distinct de la suppression de compte).
--
-- Garde métier : bloque si l'appelant est le seul admin d'un club (sinon le club se retrouve
-- sans personne habilitée à écrire, aucun garde-fou DB existant ne protège ce cas — vérifié).
-- Le client peut alors orienter vers la promotion d'un co-admin ou la suppression du club
-- (flux existant : app/webapp/manager/settings/page.tsx, "Zone dangereuse").
--
-- Nettoyage explicite plutôt que suppression suivie d'espoir de cascade : vérifié en base le
-- 2026-08-17 via pg_constraint (supabase/migrations/ n'est pas une source de vérité fiable du
-- schéma réel, cf. CLAUDE.md) que ces FK n'ont PAS de ON DELETE :
--   - public.users.id -> auth.users(id)                        (RESTRICT)
--   - public.team_posts.author_user_id -> auth.users(id)       (RESTRICT)
--   - public.team_post_comments.author_user_id -> auth.users(id) (RESTRICT)
--   - public.player_availability.updated_by -> auth.users(id)  (RESTRICT)
-- Sans ce nettoyage, DELETE FROM auth.users échoue dès que l'utilisateur a un profil, un post
-- d'équipe, un commentaire, ou a renseigné une disponibilité.
--
-- Pattern suivi : auth.uid() résolu en premier (self-scopé, aucun paramètre spoofable, cf.
-- CLAUDE.md règle sécurité #4), retour JSONB structuré { ok, error } à la claim_player_link_code.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_blocking_club RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Ne pas laisser un club sans admin.
  SELECT c.id, c.name INTO v_blocking_club
  FROM club_members cm
  JOIN clubs c ON c.id = cm.club_id
  WHERE cm.user_id = v_uid
    AND cm.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM club_members cm2
      WHERE cm2.club_id = cm.club_id
        AND cm2.role = 'admin'
        AND cm2.user_id IS DISTINCT FROM v_uid
    )
  LIMIT 1;

  IF v_blocking_club.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'sole_club_admin',
      'club_id', v_blocking_club.id,
      'club_name', v_blocking_club.name
    );
  END IF;

  -- Désamorce les FK sans cascade (RESTRICT) avant la suppression de l'identité.
  UPDATE team_posts SET author_user_id = NULL WHERE author_user_id = v_uid;
  UPDATE team_post_comments SET author_user_id = NULL WHERE author_user_id = v_uid;
  UPDATE player_availability SET updated_by = NULL WHERE updated_by = v_uid;

  DELETE FROM public.users WHERE id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
