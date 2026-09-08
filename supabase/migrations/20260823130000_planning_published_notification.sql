-- ─────────────────────────────────────────────────────────────────────────────
-- Notification push aux joueurs quand le coach partage le planning de la semaine.
--
-- share_weekly_planning_to_feed (20260814170000_team_feed_v2.sql) poste déjà dans
-- le fil d'équipe (team_posts, post_type='planning'), mais n'insère rien dans
-- public.notifications : le joueur ne voit rien tant qu'il n'ouvre pas l'onglet Fil.
-- Contrairement à create_team_post avec tags (post_tag) ou à la convocation
-- (_notify_on_convocation), c'est le seul événement "publication" qui ne pousse
-- rien. Demandé par Robin : les joueurs sont assumés présents (pas de flow de
-- confirmation à changer, cf. set_my_training_attendance, inchangé), mais ils
-- doivent être notifiés dès que le programme de la semaine est fait et partagé.
--
-- Un nouveau type ('planning_published') suffit : le pipeline push existant
-- (trigger push_on_notification_insert -> edge function send-push-notification)
-- se déclenche automatiquement sur l'INSERT, rien d'autre à brancher.
--
-- Deuxième volet, même logique inverse : _notify_on_convocation (20260609210000)
-- notifiait TOUT joueur convoqué à un entraînement, y compris dans sa propre
-- équipe — redondant avec le programme de la semaine qu'il connaît déjà et que
-- planning_published couvre désormais. Recentré sur le seul cas qui justifie
-- une notif par séance : une convocation croisée (joueur d'une autre équipe du
-- club appelé en renfort, ex. un B convoqué sur une séance A). Le flow de
-- confirmation (set_my_training_attendance, 4 statuts) n'est pas touché.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION share_weekly_planning_to_feed(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       RECORD;
  v_lines     TEXT[] := '{}';
  v_content   TEXT;
  v_post_id   UUID;
  v_team_name TEXT;
  v_player    RECORD;
BEGIN
  IF NOT has_team_write_access(p_team_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  FOR v_row IN
    SELECT date, location, 'Entraînement'::text AS kind, NULL::text AS opponent
    FROM trainings
    WHERE team_id = p_team_id AND date BETWEEN now() AND now() + interval '7 days'
    UNION ALL
    SELECT date, location, 'Match'::text AS kind, opponent_team AS opponent
    FROM matches
    WHERE team_id = p_team_id AND date BETWEEN now() AND now() + interval '7 days'
    ORDER BY date
  LOOP
    v_lines := array_append(
      v_lines,
      to_char(v_row.date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h') || ' — ' || v_row.kind
        || CASE WHEN v_row.opponent IS NOT NULL THEN ' vs ' || v_row.opponent ELSE '' END
        || COALESCE(' (' || v_row.location || ')', '')
    );
  END LOOP;

  IF array_length(v_lines, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_events');
  END IF;

  v_content := 'Planning de la semaine :' || E'\n' || array_to_string(v_lines, E'\n');

  INSERT INTO team_posts (team_id, author_user_id, content, post_type, link_url)
  VALUES (p_team_id, auth.uid(), v_content, 'planning', '/(tabs)/calendar')
  RETURNING id INTO v_post_id;

  SELECT name INTO v_team_name FROM teams WHERE id = p_team_id;

  -- Même périmètre de roster que _ensure_birthday_posts (players.team_id) +
  -- player_teams pour les joueurs multi-équipes (cf. get_my_calendar_events).
  FOR v_player IN
    SELECT DISTINCT p.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    WHERE (p.team_id = p_team_id OR pt.team_id = p_team_id)
      AND p.status = 'active'
      AND p.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_player.user_id, 'planning_published',
      'Programme de la semaine',
      'Le planning de ' || COALESCE(v_team_name, 'ton équipe') || ' est disponible.',
      jsonb_build_object('type', 'planning_published', 'team_id', p_team_id::text, 'post_id', v_post_id::text)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

REVOKE ALL ON FUNCTION share_weekly_planning_to_feed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION share_weekly_planning_to_feed(UUID) TO authenticated;

-- ── Vérification : la fonction reste inaccessible à PUBLIC ────────────────────
DO $mig$
BEGIN
  IF has_function_privilege('public', 'share_weekly_planning_to_feed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'share_weekly_planning_to_feed encore exécutable par PUBLIC après migration.';
  END IF;
  RAISE NOTICE 'OK : share_weekly_planning_to_feed verrouillée (PUBLIC révoqué), notif planning_published branchée.';
END
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notif par séance : uniquement pour une convocation hors équipe d'appartenance.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _notify_on_convocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_elem     JSONB;
  v_old      JSONB;
  v_pid      UUID;
  v_uid      UUID;
  v_tname    TEXT;
  v_date     TEXT;
  v_own_team BOOLEAN;
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

    -- Déjà dans l'équipe de la séance : rien à apprendre, couvert par
    -- planning_published. Seule une convocation croisée (autre équipe du
    -- club) est une vraie nouvelle pour le joueur.
    SELECT EXISTS (
      SELECT 1 FROM player_teams pt WHERE pt.player_id = v_pid AND pt.team_id = NEW.team_id
      UNION
      SELECT 1 FROM players p WHERE p.id = v_pid AND p.team_id = NEW.team_id
    ) INTO v_own_team;
    CONTINUE WHEN v_own_team;

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
-- Triggers notif_convocation_insert / notif_convocation_update (20260609210000)
-- référencent la fonction par nom : CREATE OR REPLACE suffit, rien à recréer.
