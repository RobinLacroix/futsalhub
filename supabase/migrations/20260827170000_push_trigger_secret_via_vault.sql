-- Retire le JWT anon codé en dur dans _push_on_notification_insert
-- (20260611000001_push_trigger_via_edge_fn.sql, ligne 10), committé en clair
-- dans le repo. Remplacé par une lecture Supabase Vault (vault.decrypted_secrets),
-- le mécanisme natif de ce projet pour un secret consommé par une fonction
-- SECURITY DEFINER — pas de current_setting()/GUC ici : ces réglages sont liés à
-- la connexion et ne se propagent pas de façon fiable au pool PostgREST tant que
-- les connexions existantes n'ont pas été recyclées, alors que Vault est une
-- simple lecture de table, toujours à jour.
--
-- Prérequis AVANT de jouer cette migration (à faire une seule fois, à la main,
-- jamais dans un fichier commité — c'est justement ce qu'on corrige) :
--
--   select vault.create_secret(
--     '<coller ici la clé anon du projet Supabase>',
--     'push_notification_anon_key',
--     'Clé anon utilisée par _push_on_notification_insert pour appeler l''edge function send-push-notification'
--   );
--
-- Sans ce secret créé au préalable, le trigger continue de fonctionner (voir
-- IF v_anon_key IS NULL THEN RETURN NEW), mais aucun push ne part.

CREATE OR REPLACE FUNCTION _push_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anon_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'push_notification_anon_key';

  -- Pas de secret configuré : ne pas bloquer l'insertion de la notification,
  -- seulement le push (même logique de dégradation que le EXCEPTION WHEN OTHERS
  -- plus bas, qui couvre déjà l'échec de l'appel HTTP lui-même).
  IF v_anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://huxuxutaywiiuhhvdoxh.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := jsonb_build_object(
      'userIds', jsonb_build_array(NEW.user_id::text),
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    COALESCE(NEW.data, '{}'::jsonb)
    )::text
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN RETURN NEW;
END;
$$;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_push_on_notification_insert';

  IF v_src ILIKE '%eyJhbGci%' THEN
    RAISE EXCEPTION '_push_on_notification_insert contient encore un JWT en dur après cette migration';
  END IF;

  IF v_src NOT ILIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION '_push_on_notification_insert devrait lire le secret depuis vault.decrypted_secrets';
  END IF;
END;
$verify$;
