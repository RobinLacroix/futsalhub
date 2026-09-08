-- Feature demandée : la liste de notifications de l'accueil ("À traiter") ne
-- renvoyait que vers la page effectif ou le calendrier en général, jamais vers
-- l'info précise. On expose maintenant les lignes individuelles de
-- `public.notifications` (déjà lisibles par leur propriétaire via RLS, cf.
-- 20260609210000) pour construire une page "voir tout" côté app qui route
-- chaque notification vers son écran cible (session, joueur...) à partir de
-- `data`. Pattern self-scoped sur auth.uid(), sans paramètre d'id spoofable —
-- aucune garde d'accès supplémentaire nécessaire.

CREATE OR REPLACE FUNCTION get_my_notifications(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'type', n.type,
      'title', n.title,
      'body', n.body,
      'data', n.data,
      'read_at', n.read_at,
      'created_at', n.created_at
    ) ORDER BY n.created_at DESC
  ), '[]'::jsonb)
  FROM (
    SELECT *
    FROM public.notifications
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  ) n;
$$;

REVOKE ALL ON FUNCTION get_my_notifications(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_notifications(INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
  SET read_at = NOW()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION mark_notification_read(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_public_has_grant BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN aclexplode(p.proacl) a ON TRUE
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE p.proname IN ('get_my_notifications', 'mark_notification_read')
      AND r.rolname = 'public'
      AND a.privilege_type = 'EXECUTE'
  ) INTO v_public_has_grant;

  IF v_public_has_grant THEN
    RAISE EXCEPTION 'get_my_notifications / mark_notification_read ne doivent pas être exécutables par PUBLIC';
  END IF;
END;
$verify$;
