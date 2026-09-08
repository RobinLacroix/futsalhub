-- Délier un compte joueur, mobile — coach de l'équipe, joueur lui-même, ou admin du club.
--
-- Le trou : `players.user_id` se dé-liait déjà côté web (écriture directe sur la table,
-- app/webapp/manager/squad/[playerId]/page.tsx), couverte par la policy UPDATE existante
-- (has_team_write_access, cf. 20260730100000) — donc coach de l'équipe et admin du club
-- pouvaient déjà le faire, mais seulement depuis le web. Le joueur lui-même ne le pouvait
-- nulle part : la policy d'écriture sur `players` ne couvre que coach/admin, pas le joueur
-- sur sa propre fiche. Ouvrir l'UPDATE RLS en général au joueur lui donnerait le droit de
-- modifier n'importe quelle colonne de sa fiche (nom, numéro...), pas seulement `user_id` —
-- d'où une RPC dédiée plutôt qu'un assouplissement de policy.
--
-- Pattern suivi : auth.uid() résolu en premier (cf. CLAUDE.md règle sécurité #4), retour
-- JSONB structuré { ok, error } comme claim_player_link_code / delete_own_account.
CREATE OR REPLACE FUNCTION public.unlink_player_account(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_team_id UUID;
  v_owner UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT team_id, user_id INTO v_team_id, v_owner
  FROM players
  WHERE id = p_player_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT (has_team_write_access(v_team_id) OR v_owner IS NOT DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_access');
  END IF;

  UPDATE players SET user_id = NULL WHERE id = p_player_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_player_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_player_account(UUID) TO authenticated;
