-- Fix : notification pain_report diffusée à TOUT le club, pas seulement aux coachs
-- des équipes du joueur concerné.
--
-- Diagnostic (vérifié en base via pg_proc, claude_audit) : `_notify_pain_report`
-- (20260729120000_pain_reports.sql, veille de la ségrégation) n'a pas été couverte par
-- 20260730110000_notifications_segregation_and_prefs — cette migration n'a corrigé que
-- _notify_on_absence et _notify_on_feedback_comment. `_notify_pain_report` est restée sur
-- l'ancien pattern pré-ségrégation : JOIN club_members ON cm.club_id = t.club_id sans
-- filtrer sur cm.team_id, donc TOUS les coachs/admins du club reçoivent chaque
-- signalement de douleur, quelle que soit l'équipe du joueur. C'est très probablement la
-- cause du coach U18 recevant des notifications de l'équipe première : douleur/blessure
-- signalée par un joueur première, notifiée à tout le club.
--
-- Correctif : même pattern que _notify_on_absence (admins du club + coach rattaché à
-- CHACUNE des équipes du joueur, un joueur pouvant être multi-équipes via player_teams),
-- plus le filtre de préférence _notif_enabled (type 'pain_report' ajouté à la liste
-- des types configurables, cf. §2 ci-dessous).
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

  -- destinataires : admins du club + coach rattaché à une équipe DU JOUEUR (team_id
  -- primaire players.team_id, ou secondaire via player_teams). Un joueur multi-équipes
  -- notifie chaque coach concerné, jamais les coachs d'équipes auxquelles il n'appartient pas.
  FOR v_cuid IN
    SELECT DISTINCT cm.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = COALESCE(pt.team_id, p.team_id)
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.id = p_player_id
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = t.id)
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

-- ── Type pain_report configurable, comme absence_report/injury/feedback_comment/questionnaire_response ──
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
    'questionnaire_response',_notif_enabled(auth.uid(), 'questionnaire_response'),
    'pain_report',           _notif_enabled(auth.uid(), 'pain_report')
  );
$$;

CREATE OR REPLACE FUNCTION set_my_notification_preference(p_type TEXT, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('absence_report','injury','feedback_comment','questionnaire_response','pain_report') THEN
    RAISE EXCEPTION 'Type de notification inconnu: %', p_type;
  END IF;
  INSERT INTO notification_preferences (user_id, type, enabled, updated_at)
  VALUES (auth.uid(), p_type, p_enabled, NOW())
  ON CONFLICT (user_id, type)
  DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();
END;
$$;

-- ── Vérification : plus aucune notification pain_report future ne doit pouvoir sortir
-- du périmètre équipe du joueur. Contrôle statique sur le corps de la fonction : elle
-- doit référencer team_id (garde par équipe), pas seulement club_id.
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = '_notify_pain_report';
  IF v_src NOT ILIKE '%cm.team_id = t.id%' THEN
    RAISE EXCEPTION '_notify_pain_report a perdu sa garde de ségrégation par équipe';
  END IF;
END;
$verify$;
