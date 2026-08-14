-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications côté staff : (1) ségrégation par équipe, (2) préférences par type,
-- (3) split "blessure" (injury) hors de absence_report, (4) nouvelle notif
-- "réponse au questionnaire" (questionnaire_response).
--
-- Problème corrigé : _notify_on_absence / _notify_on_feedback_comment joignaient
-- club_members sur club_id seul => TOUS les coachs du club étaient notifiés
-- (un coach B recevait les alertes de l'équipe A). Désormais : admins du club +
-- coach rattaché à l'équipe concernée uniquement.
--
-- Types staff gérés par les préférences :
--   absence_report        présence/absence (absent, en retard)
--   injury                blessure signalée en présence (auparavant fondue dans absence_report)
--   feedback_comment      commentaire libre du questionnaire
--   questionnaire_response réponse au questionnaire (nouveau)
-- Les types joueur (convocation, questionnaire) ne sont PAS filtrés par ces prefs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ 1. Table préférences + RPCs + helper ═════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own notif prefs" ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "write own notif prefs" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Absence de ligne = activé (opt-out). Un type est désactivé seulement si
-- une ligne existe avec enabled = false.
CREATE OR REPLACE FUNCTION _notif_enabled(p_user_id UUID, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM notification_preferences
     WHERE user_id = p_user_id AND type = p_type),
    TRUE
  );
$$;

-- Retourne l'état des 4 types staff pour l'appelant (default true).
CREATE OR REPLACE FUNCTION get_my_notification_preferences()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'absence_report',        _notif_enabled(auth.uid(), 'absence_report'),
    'injury',                _notif_enabled(auth.uid(), 'injury'),
    'feedback_comment',      _notif_enabled(auth.uid(), 'feedback_comment'),
    'questionnaire_response',_notif_enabled(auth.uid(), 'questionnaire_response')
  );
$$;

CREATE OR REPLACE FUNCTION set_my_notification_preference(p_type TEXT, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('absence_report','injury','feedback_comment','questionnaire_response') THEN
    RAISE EXCEPTION 'Type de notification inconnu: %', p_type;
  END IF;
  INSERT INTO notification_preferences (user_id, type, enabled, updated_at)
  VALUES (auth.uid(), p_type, p_enabled, NOW())
  ON CONFLICT (user_id, type)
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_notification_preferences()          TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_notification_preference(TEXT, BOOLEAN) TO authenticated;
-- _notif_enabled : usage interne aux triggers (DEFINER), pas de grant authenticated nécessaire.

-- ══ 2. Trigger absence : ségrégation par équipe + split injury + prefs ════════

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
  v_type   TEXT;
  v_title  TEXT;
BEGIN
  FOR v_pid, v_news IN
    SELECT key, value FROM jsonb_each_text(COALESCE(NEW.attendance, '{}'::jsonb))
  LOOP
    v_olds := COALESCE(OLD.attendance->>v_pid, '');
    CONTINUE WHEN v_news NOT IN ('absent','late','injured') OR v_news = v_olds;

    -- blessure = type dédié ; absent/retard = absence_report
    IF v_news = 'injured' THEN
      v_type  := 'injury';
      v_label := 'blessé';
      v_title := 'Blessé';
    ELSE
      v_type  := 'absence_report';
      v_label := CASE v_news WHEN 'absent' THEN 'absent' ELSE 'en retard' END;
      v_title := CASE v_news WHEN 'absent' THEN 'Absent' ELSE 'En retard' END;
    END IF;

    SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = v_pid::UUID;
    v_tdate := TO_CHAR(NEW.date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');

    -- destinataires : admins du club + coach rattaché à CETTE équipe
    FOR v_cuid IN
      SELECT cm.user_id FROM club_members cm
      JOIN teams t ON t.club_id = cm.club_id
      WHERE t.id = NEW.team_id
        AND cm.role IN ('admin','coach')
        AND (cm.role = 'admin' OR cm.team_id = NEW.team_id)
    LOOP
      CONTINUE WHEN NOT _notif_enabled(v_cuid, v_type);
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_cuid, v_type,
        COALESCE(v_pname, 'Un joueur') || ' · ' || v_title,
        COALESCE(v_pname, 'Un joueur') || ' se déclare ' || v_label || ' pour la séance du ' || v_tdate,
        jsonb_build_object('type', v_type, 'training_id', NEW.id::text, 'player_id', v_pid)
      );
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ══ 3. Trigger commentaire : ségrégation par équipe + prefs ═══════════════════

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
    WHERE t.id = v_tid
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = v_tid)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'feedback_comment');
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

-- ══ 4. Nouveau trigger : réponse au questionnaire (training_player_feedback) ══

CREATE OR REPLACE FUNCTION _notify_on_questionnaire_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pname TEXT;
  v_tid   UUID;
  v_date  TEXT;
  v_theme TEXT;
  v_cuid  UUID;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = NEW.player_id;

  SELECT team_id,
         TO_CHAR(date AT TIME ZONE 'Europe/Paris', 'DD/MM'),
         COALESCE(theme, '')
  INTO v_tid, v_date, v_theme
  FROM trainings WHERE id = NEW.training_id;

  IF v_tid IS NULL THEN RETURN NEW; END IF;

  FOR v_cuid IN
    SELECT cm.user_id FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE t.id = v_tid
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = v_tid)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'questionnaire_response');
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'questionnaire_response',
      'Questionnaire · ' || COALESCE(v_pname, 'un joueur'),
      COALESCE(v_pname, 'Un joueur') || ' a répondu au questionnaire du ' || COALESCE(v_date, '?')
        || CASE WHEN v_theme <> '' THEN ' (' || v_theme || ')' ELSE '' END,
      jsonb_build_object('type','questionnaire_response','training_id',NEW.training_id::text,'player_id',NEW.player_id::text)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notif_questionnaire_response_insert ON public.training_player_feedback;
CREATE TRIGGER notif_questionnaire_response_insert
  AFTER INSERT ON public.training_player_feedback
  FOR EACH ROW
  EXECUTE FUNCTION _notify_on_questionnaire_response();

-- ══ 5. Push mobile : segrège get_my_coaches_user_ids par équipe ══════════════

CREATE OR REPLACE FUNCTION get_my_coaches_user_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_team_ids AS (
    SELECT DISTINCT tid FROM (
      SELECT p.team_id AS tid FROM players p WHERE p.user_id = auth.uid()
      UNION
      SELECT pt.team_id FROM players p
      JOIN player_teams pt ON pt.player_id = p.id
      WHERE p.user_id = auth.uid()
    ) s WHERE tid IS NOT NULL
  )
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT cm.user_id
    FROM my_team_ids mt
    JOIN teams t ON t.id = mt.tid
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE cm.user_id <> auth.uid()
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = mt.tid)
  ), ARRAY[]::UUID[]);
$$;

GRANT EXECUTE ON FUNCTION get_my_coaches_user_ids() TO authenticated;

-- ══ 6. Compteurs & badges : intègrent injury + questionnaire_response ═════════

CREATE OR REPLACE FUNCTION get_my_notification_counts()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'convocation',            COUNT(*) FILTER (WHERE type = 'convocation'),
    'questionnaire',          COUNT(*) FILTER (WHERE type = 'questionnaire'),
    'absence_report',         COUNT(*) FILTER (WHERE type = 'absence_report'),
    'injury',                 COUNT(*) FILTER (WHERE type = 'injury'),
    'feedback_comment',       COUNT(*) FILTER (WHERE type = 'feedback_comment'),
    'questionnaire_response', COUNT(*) FILTER (WHERE type = 'questionnaire_response'),
    'total',                  COUNT(*)
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

-- Badge "présence" du calendrier : absence_report + injury groupés par séance.
CREATE OR REPLACE FUNCTION get_unread_absence_training_ids()
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT (data->>'training_id')::UUID), ARRAY[]::UUID[])
  FROM notifications
  WHERE user_id = auth.uid()
    AND type IN ('absence_report','injury')
    AND read_at IS NULL
    AND data->>'training_id' IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION mark_training_absence_read(p_training_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND type IN ('absence_report','injury')
    AND data->>'training_id' = p_training_id::text
    AND read_at IS NULL;
$$;

-- Badge "feedback" de l'effectif : feedback_comment + questionnaire_response par joueur.
CREATE OR REPLACE FUNCTION get_unread_feedback_player_ids()
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT (data->>'player_id')::UUID), ARRAY[]::UUID[])
  FROM notifications
  WHERE user_id = auth.uid()
    AND type IN ('feedback_comment','questionnaire_response')
    AND read_at IS NULL
    AND data->>'player_id' IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION mark_player_feedback_read(p_player_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND type IN ('feedback_comment','questionnaire_response')
    AND data->>'player_id' = p_player_id::text
    AND read_at IS NULL;
$$;
