-- Bug remonté par les users : les admins qui sont aussi coach d'une équipe reçoivent
-- CHAQUE notification d'absence/blessure/commentaire/questionnaire EN DOUBLE.
--
-- Cause confirmée sur la base réelle (pg_get_functiondef) : un même user_id peut avoir
-- deux lignes club_members pour le même club (une role='admin', une role='coach' avec
-- team_id renseigné — cf. 20250118000002_step3_create_club_members.sql, deux index
-- uniques partiels distincts, rien n'empêche la coexistence). Les boucles FOR de
-- _notify_on_absence / _notify_on_feedback_comment / _notify_on_questionnaire_response
-- font un JOIN club_members SANS DISTINCT ni GROUP BY : la clause
--   WHERE cm.role IN ('admin','coach') AND (cm.role = 'admin' OR cm.team_id = <team>)
-- matche alors les deux lignes du même user_id → deux INSERT INTO notifications → push en double.
--
-- _notify_pain_report (même fichier 20260822140000) a déjà le bon pattern (GROUP BY
-- cm.user_id, commentaire explicite). On applique le même correctif aux 3 fonctions
-- restantes. Correctif fonctionnel pur : pas de garde d'accès à changer, pas de nouvelle
-- surface anon, juste la dédup manquante.

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

    FOR v_cuid IN
      SELECT DISTINCT cm.user_id FROM club_members cm
      JOIN teams t ON t.club_id = cm.club_id
      WHERE t.id = NEW.team_id
        AND cm.role IN ('admin','coach')
        AND (cm.role = 'admin' OR cm.team_id = NEW.team_id)
    LOOP
      CONTINUE WHEN NOT _notif_enabled(v_cuid, v_type) OR NOT _notif_team_enabled(v_cuid, NEW.team_id);
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
    SELECT DISTINCT cm.user_id FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE t.id = v_tid
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = v_tid)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'feedback_comment') OR NOT _notif_team_enabled(v_cuid, v_tid);
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
    SELECT DISTINCT cm.user_id FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE t.id = v_tid
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = v_tid)
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'questionnaire_response') OR NOT _notif_team_enabled(v_cuid, v_tid);
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

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_on_absence';
  IF v_src NOT ILIKE '%SELECT DISTINCT cm.user_id%' THEN
    RAISE EXCEPTION '_notify_on_absence devrait dédupliquer avec SELECT DISTINCT après cette migration';
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_on_feedback_comment';
  IF v_src NOT ILIKE '%SELECT DISTINCT cm.user_id%' THEN
    RAISE EXCEPTION '_notify_on_feedback_comment devrait dédupliquer avec SELECT DISTINCT après cette migration';
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_on_questionnaire_response';
  IF v_src NOT ILIKE '%SELECT DISTINCT cm.user_id%' THEN
    RAISE EXCEPTION '_notify_on_questionnaire_response devrait dédupliquer avec SELECT DISTINCT après cette migration';
  END IF;
END;
$verify$;
