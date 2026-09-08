-- Préférences de notification par équipe, en plus du filtre par type déjà en place
-- (notification_preferences, 20260730110000 — jamais branché à une UI, ni web ni mobile).
--
-- Deux axes indépendants, demandés par Robin pour les profils admin :
--   - par TYPE (existant, get_my_notification_preferences / set_my_notification_preference)
--   - par ÉQUIPE (nouveau) : un admin peut couper les notifications d'une équipe précise
--     sans toucher aux autres, plutôt qu'une matrice type×équipe — plus simple à régler,
--     et suffisant pour le besoin exprimé ("pour quelle équipe on accepte les notifs").
-- Un événement passe si (type activé) ET (équipe activée). Absence de ligne = activé
-- (opt-out), même convention que notification_preferences.
CREATE TABLE IF NOT EXISTS public.notification_team_preferences (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, team_id)
);

ALTER TABLE public.notification_team_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own notif team prefs" ON public.notification_team_preferences;
CREATE POLICY "read own notif team prefs" ON public.notification_team_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "write own notif team prefs" ON public.notification_team_preferences;
CREATE POLICY "write own notif team prefs" ON public.notification_team_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION _notif_team_enabled(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM notification_team_preferences
     WHERE user_id = p_user_id AND team_id = p_team_id),
    TRUE
  );
$$;

REVOKE ALL ON FUNCTION _notif_team_enabled(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Équipes de l'appelant en tant qu'admin de club (le réglage par équipe est un outil
-- admin, cf. demande initiale — un coach n'a de toute façon déjà que ses équipes).
CREATE OR REPLACE FUNCTION get_my_notification_team_preferences()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'team_id', t.id,
      'team_name', t.name,
      'enabled', _notif_team_enabled(auth.uid(), t.id)
    ) ORDER BY t.name
  ), '[]'::jsonb)
  FROM teams t
  WHERE t.club_id IN (
    SELECT club_id FROM club_members WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION set_my_notification_team_preference(p_team_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND t.id = p_team_id
  ) THEN
    RAISE EXCEPTION 'no_access';
  END IF;

  INSERT INTO notification_team_preferences (user_id, team_id, enabled, updated_at)
  VALUES (auth.uid(), p_team_id, p_enabled, NOW())
  ON CONFLICT (user_id, team_id)
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_notification_team_preferences()              TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_notification_team_preference(UUID, BOOLEAN)  TO authenticated;

-- ── Les 4 triggers staff prennent désormais aussi la garde équipe ─────────────
-- (garde type existante _notif_enabled inchangée, simple ET logique en plus)

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
      SELECT cm.user_id FROM club_members cm
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
    SELECT cm.user_id FROM club_members cm
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
    SELECT cm.user_id FROM club_members cm
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

CREATE OR REPLACE FUNCTION public._notify_pain_report(
  p_player_id  UUID,
  p_max_int    SMALLINT,
  p_zone_count INTEGER,
  p_first_zone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pname TEXT;
  v_cuid  UUID;
  v_sev   TEXT;
  v_body  TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = p_player_id;

  v_sev := CASE p_max_int
             WHEN 3 THEN 'très intense'
             WHEN 2 THEN 'assez intense'
             ELSE 'modérée'
           END;

  v_body := COALESCE(v_pname, 'Un joueur')
            || ' signale une douleur ' || v_sev
            || CASE WHEN p_zone_count > 1
                    THEN ' sur ' || p_zone_count || ' zones (' || COALESCE(p_first_zone,'?') || '…)'
                    ELSE ' : ' || COALESCE(p_first_zone,'?')
               END;

  -- Un joueur peut avoir plusieurs équipes (player_teams) : un coach qualifie dès qu'AU
  -- MOINS une des équipes qui le relie au joueur a ses notifications activées (GROUP BY
  -- déduplique aussi l'utilisateur si plusieurs équipes le relient au joueur).
  FOR v_cuid IN
    SELECT cm.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = COALESCE(pt.team_id, p.team_id)
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.id = p_player_id
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = t.id)
      AND _notif_team_enabled(cm.user_id, t.id)
    GROUP BY cm.user_id
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'pain_report');
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'pain_report',
      COALESCE(v_pname, 'Un joueur') || ' · Douleur signalée',
      v_body,
      jsonb_build_object('type','pain_report','player_id',p_player_id::text,'max_intensity',p_max_int)
    );
  END LOOP;
END;
$$;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_on_absence';
  IF v_src NOT ILIKE '%_notif_team_enabled%' THEN
    RAISE EXCEPTION '_notify_on_absence devrait vérifier _notif_team_enabled après cette migration';
  END IF;
END;
$verify$;
