-- ─────────────────────────────────────────────────────────────────────────────
-- notifications : table + triggers + RPCs
-- Couvre 4 événements :
--   convocation        → joueur convoqué à un entraînement
--   questionnaire      → token de questionnaire créé pour un joueur
--   absence_report     → joueur se déclare absent / retard / blessé
--   feedback_comment   → joueur laisse un commentaire dans son questionnaire
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ── RPCs ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_notification_counts()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'convocation',      COUNT(*) FILTER (WHERE type = 'convocation'),
    'questionnaire',    COUNT(*) FILTER (WHERE type = 'questionnaire'),
    'absence_report',   COUNT(*) FILTER (WHERE type = 'absence_report'),
    'feedback_comment', COUNT(*) FILTER (WHERE type = 'feedback_comment'),
    'total',            COUNT(*)
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION mark_notifications_read(p_types TEXT[] DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND (p_types IS NULL OR type = ANY(p_types));
$$;

-- Retourne les user_ids des coaches/admins des équipes du joueur connecté
-- (utilisé par l'app mobile pour envoyer un push aux coaches depuis le client)
CREATE OR REPLACE FUNCTION get_my_coaches_user_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT cm.user_id
    FROM players p
    JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = pt.team_id
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.user_id = auth.uid()
      AND cm.role NOT IN ('viewer')
      AND cm.user_id <> auth.uid()
    UNION
    SELECT DISTINCT cm.user_id
    FROM players p2
    JOIN teams t2 ON t2.id = p2.team_id
    JOIN club_members cm ON cm.club_id = t2.club_id
    WHERE p2.user_id = auth.uid()
      AND cm.role NOT IN ('viewer')
      AND cm.user_id <> auth.uid()
  ), ARRAY[]::UUID[]);
$$;

GRANT EXECUTE ON FUNCTION get_my_notification_counts()    TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_read(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_coaches_user_ids()       TO authenticated;

-- ── Trigger 1 : convocation (joueur ajouté à convoked_players) ────────────────

CREATE OR REPLACE FUNCTION _notify_on_convocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_elem  JSONB;
  v_old   JSONB;
  v_pid   UUID;
  v_uid   UUID;
  v_tname TEXT;
  v_date  TEXT;
BEGIN
  v_old := CASE WHEN TG_OP = 'INSERT' THEN '[]'::jsonb
                ELSE COALESCE(OLD.convoked_players, '[]'::jsonb)
           END;

  IF COALESCE(NEW.convoked_players, '[]'::jsonb) = '[]'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_tname FROM teams WHERE id = NEW.team_id;
  v_date := TO_CHAR(NEW.date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');

  FOR v_elem IN
    SELECT * FROM jsonb_array_elements(COALESCE(NEW.convoked_players, '[]'::jsonb))
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_old) e WHERE e->>'id' = v_elem->>'id'
    );
    v_pid := (v_elem->>'id')::UUID;
    SELECT user_id INTO v_uid FROM players WHERE id = v_pid;
    IF v_uid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_uid, 'convocation',
        'Convocation',
        'Tu es convoqué pour ' || COALESCE(v_tname, 'l''entraînement') || ' le ' || v_date,
        jsonb_build_object('type','convocation','training_id',NEW.id::text,'team_name',v_tname)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notif_convocation_insert
  AFTER INSERT ON public.trainings
  FOR EACH ROW
  EXECUTE FUNCTION _notify_on_convocation();

CREATE TRIGGER notif_convocation_update
  AFTER UPDATE ON public.trainings
  FOR EACH ROW
  WHEN (OLD.convoked_players IS DISTINCT FROM NEW.convoked_players)
  EXECUTE FUNCTION _notify_on_convocation();

-- ── Trigger 2 : questionnaire disponible ──────────────────────────────────────

CREATE OR REPLACE FUNCTION _notify_on_questionnaire()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID;
  v_date  TEXT;
  v_theme TEXT;
BEGIN
  SELECT user_id INTO v_uid FROM players WHERE id = NEW.player_id;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  SELECT TO_CHAR(date AT TIME ZONE 'Europe/Paris', 'DD/MM'), COALESCE(theme, '')
  INTO v_date, v_theme
  FROM trainings WHERE id = NEW.training_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_uid, 'questionnaire',
    'Questionnaire disponible',
    'Ton bilan du ' || COALESCE(v_date, '?')
      || CASE WHEN v_theme <> '' THEN ' (' || v_theme || ')' ELSE '' END
      || ' est disponible.',
    jsonb_build_object('type','questionnaire','training_id',NEW.training_id::text,'token',NEW.token)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER notif_questionnaire_insert
  AFTER INSERT ON public.training_feedback_tokens
  FOR EACH ROW
  EXECUTE FUNCTION _notify_on_questionnaire();

-- ── Trigger 3 : joueur se déclare absent / retard / blessé ───────────────────

CREATE OR REPLACE FUNCTION _notify_on_absence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid    TEXT;
  v_news   TEXT;
  v_olds   TEXT;
  v_pname  TEXT;
  v_tdate  TEXT;
  v_cuid   UUID;
  v_label  TEXT;
BEGIN
  FOR v_pid, v_news IN
    SELECT key, value FROM jsonb_each_text(COALESCE(NEW.attendance, '{}'::jsonb))
  LOOP
    v_olds := COALESCE(OLD.attendance->>v_pid, '');
    CONTINUE WHEN v_news NOT IN ('absent','late','injured') OR v_news = v_olds;

    v_label := CASE v_news
      WHEN 'absent'  THEN 'absent'
      WHEN 'late'    THEN 'en retard'
      WHEN 'injured' THEN 'blessé'
    END;
    SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = v_pid::UUID;
    v_tdate := TO_CHAR(NEW.date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');

    FOR v_cuid IN
      SELECT cm.user_id FROM club_members cm
      JOIN teams t ON t.club_id = cm.club_id
      WHERE t.id = NEW.team_id AND cm.role NOT IN ('viewer')
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_cuid, 'absence_report',
        COALESCE(v_pname, 'Un joueur') || ' · ' ||
          CASE v_news WHEN 'absent' THEN 'Absent' WHEN 'late' THEN 'En retard' ELSE 'Blessé' END,
        COALESCE(v_pname, 'Un joueur') || ' se déclare ' || v_label || ' pour la séance du ' || v_tdate,
        jsonb_build_object('type','absence_report','training_id',NEW.id::text,'player_id',v_pid)
      );
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notif_absence_update
  AFTER UPDATE ON public.trainings
  FOR EACH ROW
  WHEN (OLD.attendance IS DISTINCT FROM NEW.attendance)
  EXECUTE FUNCTION _notify_on_absence();

-- ── Trigger 4 : commentaire libre dans le questionnaire ──────────────────────

CREATE OR REPLACE FUNCTION _notify_on_feedback_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pname TEXT;
  v_tid   UUID;
  v_cuid  UUID;
  v_body  TEXT;
BEGIN
  IF NEW.event_type <> 'feedback' THEN RETURN NEW; END IF;
  IF NEW.report IS NULL OR trim(NEW.report) = '' THEN RETURN NEW; END IF;

  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = NEW.player_id;

  SELECT COALESCE(pt.team_id, p.team_id) INTO v_tid
  FROM players p
  LEFT JOIN player_teams pt ON pt.player_id = p.id
  WHERE p.id = NEW.player_id
  LIMIT 1;

  v_body := CASE WHEN length(NEW.report) > 80
                 THEN left(NEW.report, 80) || '…'
                 ELSE NEW.report
            END;

  FOR v_cuid IN
    SELECT cm.user_id FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE t.id = v_tid AND cm.role NOT IN ('viewer')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'feedback_comment',
      'Commentaire de ' || COALESCE(v_pname, 'un joueur'),
      v_body,
      jsonb_build_object('type','feedback_comment','player_id',NEW.player_id::text)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notif_feedback_comment_insert
  AFTER INSERT ON public.player_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'feedback')
  EXECUTE FUNCTION _notify_on_feedback_comment();
