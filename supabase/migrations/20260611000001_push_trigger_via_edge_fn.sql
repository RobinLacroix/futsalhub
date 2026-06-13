-- Remplace le trigger qui appelait l'API Expo directement par un appel à
-- l'edge function, qui gère APNs natif (iOS) + Expo (Android).
CREATE OR REPLACE FUNCTION _push_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://huxuxutaywiiuhhvdoxh.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1eHV4dXRheXdpaXVoaHZkb3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2OTI1NDgsImV4cCI6MjA2MjI2ODU0OH0.ZLeA5iQEFvFq93h1wZvtoXIGcDm_LT3C9wH5WOU7y2U'
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
