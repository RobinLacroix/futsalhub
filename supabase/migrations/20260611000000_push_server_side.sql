-- ─────────────────────────────────────────────────────────────────────────────
-- Push notifications server-side via pg_net + API Expo
-- Chaque INSERT dans public.notifications déclenche automatiquement un push
-- device vers tous les appareils enregistrés de l'utilisateur destinataire.
-- Remplace les appels client-side pushToMyCoaches / notifyPlayers pour les
-- 4 types d'événements couverts par des triggers DB.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _push_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_messages JSONB;
BEGIN
  -- Construire un payload Expo pour chaque token enregistré de l'utilisateur
  SELECT jsonb_agg(
    jsonb_build_object(
      'to',    token,
      'title', NEW.title,
      'body',  NEW.body,
      'data',  COALESCE(NEW.data, '{}'::jsonb),
      'sound', 'default'
    )
  )
  INTO v_messages
  FROM public.push_tokens
  WHERE user_id = NEW.user_id;

  -- Aucun token enregistré pour cet utilisateur → rien à faire
  IF v_messages IS NULL THEN
    RETURN NEW;
  END IF;

  -- Appel asynchrone à l'API Expo (pg_net, hors transaction)
  PERFORM net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json","Accept":"application/json","Accept-Encoding":"gzip, deflate"}'::jsonb,
    body    := v_messages::text
  );

  RETURN NEW;
EXCEPTION
  -- Ne jamais bloquer la transaction si pg_net est absent ou si l'appel échoue
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION _push_on_notification_insert();
