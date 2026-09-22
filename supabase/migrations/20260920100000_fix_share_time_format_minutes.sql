-- ─────────────────────────────────────────────────────────────────────────────
-- Demande Robin : dans l'app mobile, le planning de la semaine et les
-- convocations partagés dans le fil affichent l'heure de coup d'envoi /
-- d'entraînement au format 'DD/MM à HH24h' — ça tronque les minutes (un
-- match à 18h30 s'affiche "18h"). La ligne "Rendez-vous" du même message
-- utilise déjà HH24:MI et affiche correctement les minutes ; on aligne les
-- trois autres occurrences du même bug sur ce format.
--
-- Fonctions touchées (celles qui alimentent réellement le contenu partagé
-- "programme de la semaine" / "convocation match" évoqué par Robin) :
--   - _format_match_convocation   : ligne "📅 Coup d'envoi"
--   - share_convocation_to_feed   : ligne de convocation entraînement
--   - share_weekly_planning_to_feed : chaque ligne du digest 7 jours
--
-- Pas de changement de logique, seulement le format de date (règle §5 du
-- protocole migrations respectée : bug isolé, pas mêlé à une migration de
-- sécurité).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _format_match_convocation(p_match_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title       TEXT;
  v_date        TIMESTAMPTZ;
  v_location    TEXT;
  v_venue       TEXT;
  v_meeting     TIMESTAMPTZ;
  v_message     TEXT;
  v_count       INT;
  v_date_label  TEXT;
  v_name_arr    TEXT[];
  v_names       TEXT;
  v_extra       INT;
  v_info_lines  TEXT[];
  v_blocks      TEXT[];
BEGIN
  SELECT title, date, location, venue_address, meeting_time, convocation_message,
         jsonb_array_length(COALESCE(players, '[]'::jsonb))
  INTO v_title, v_date, v_location, v_venue, v_meeting, v_message, v_count
  FROM matches WHERE id = p_match_id;
  IF v_title IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(v_count, 0) = 0 THEN RETURN NULL; END IF;

  -- Noms des joueurs convoqués : gardiens d'abord, puis ordre alphabétique.
  -- Cap à 16 noms affichés (effectif futsal rarement plus large ; un pavé de
  -- 25 noms ne se lit pas). Le cap s'applique APRÈS le tri gardiens-d'abord
  -- (array_agg ORDER BY puis slice), pas avant : sinon un gardien alphabétique-
  -- ment tardif pouvait être coupé par le LIMIT côté sous-requête distincte.
  SELECT array_agg(
    pl.first_name || ' ' || pl.last_name
    ORDER BY (pl.position ILIKE '%gardien%') DESC, pl.last_name, pl.first_name
  )
  INTO v_name_arr
  FROM (
    SELECT DISTINCT elem->>'id' AS player_id
    FROM matches m, jsonb_array_elements(m.players) AS elem
    WHERE m.id = p_match_id
  ) ids
  JOIN players pl ON pl.id = (ids.player_id)::UUID;

  IF array_length(v_name_arr, 1) > 16 THEN
    v_extra := array_length(v_name_arr, 1) - 16;
    v_names := array_to_string(v_name_arr[1:16], ', ')
      || ' et ' || v_extra || ' autre' || CASE WHEN v_extra > 1 THEN 's' ELSE '' END;
  ELSE
    v_names := array_to_string(v_name_arr, ', ');
  END IF;

  v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24:MI');

  -- Section 1 : informations générales
  v_info_lines := ARRAY['📋 Match : ' || v_title];
  v_info_lines := array_append(v_info_lines, '📅 Coup d''envoi : ' || v_date_label);
  IF v_meeting IS NOT NULL THEN
    v_info_lines := array_append(v_info_lines, '🕒 Rendez-vous : ' || to_char(v_meeting AT TIME ZONE 'Europe/Paris', 'HH24:MI'));
  END IF;
  IF COALESCE(v_venue, v_location) IS NOT NULL THEN
    v_info_lines := array_append(v_info_lines, '📍 Lieu : ' || COALESCE(v_venue, v_location));
  END IF;
  v_blocks := ARRAY[array_to_string(v_info_lines, E'\n')];

  -- Section 2 : joueurs convoqués (gardiens d'abord)
  v_blocks := array_append(
    v_blocks,
    '👥 Joueurs convoqués (' || v_count || ')' || E'\n' || COALESCE(v_names, '')
  );

  -- Section 3 : message du coach (si renseigné)
  IF v_message IS NOT NULL AND trim(v_message) <> '' THEN
    v_blocks := array_append(v_blocks, '✉️ ' || v_message);
  END IF;

  RETURN array_to_string(v_blocks, E'\n\n');
END;
$$;

REVOKE ALL ON FUNCTION _format_match_convocation(UUID) FROM PUBLIC, anon, authenticated;

-- ── share_convocation_to_feed : branche entraînement, même correctif ─────────

CREATE OR REPLACE FUNCTION share_convocation_to_feed(
  p_training_id UUID DEFAULT NULL,
  p_match_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id     UUID;
  v_date        TIMESTAMPTZ;
  v_location    TEXT;
  v_count       INT;
  v_date_label  TEXT;
  v_content     TEXT;
  v_link        TEXT;
  v_post_id     UUID;
BEGIN
  IF (p_training_id IS NULL) = (p_match_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_request');
  END IF;

  IF p_training_id IS NOT NULL THEN
    SELECT team_id, date, location, jsonb_array_length(COALESCE(convoked_players, '[]'::jsonb))
    INTO v_team_id, v_date, v_location, v_count
    FROM trainings WHERE id = p_training_id;
    IF v_team_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
    IF NOT has_team_write_access(v_team_id) THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
    IF COALESCE(v_count, 0) = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_convocation'); END IF;

    v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24:MI');
    v_content := 'Convocation : Entraînement le ' || v_date_label
      || COALESCE(' — ' || v_location, '')
      || ' (' || v_count || ' joueur' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ' convoqué'
      || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ')';
    v_link := '/(tabs)/calendar/training/' || p_training_id::text;
  ELSE
    SELECT team_id INTO v_team_id FROM matches WHERE id = p_match_id;
    IF v_team_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
    IF NOT has_team_write_access(v_team_id) THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;

    v_content := _format_match_convocation(p_match_id);
    IF v_content IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_convocation'); END IF;
    v_link := '/(tabs)/calendar/matchDetail/' || p_match_id::text;
  END IF;

  INSERT INTO team_posts (team_id, author_user_id, content, post_type, link_url)
  VALUES (v_team_id, auth.uid(), v_content, 'convocation', v_link)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

REVOKE ALL ON FUNCTION share_convocation_to_feed(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION share_convocation_to_feed(UUID, UUID) TO authenticated;

-- ── share_weekly_planning_to_feed : même correctif sur chaque ligne du digest ─

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
      to_char(v_row.date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24:MI') || ' — ' || v_row.kind
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

REVOKE ALL ON FUNCTION share_weekly_planning_to_feed(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION share_weekly_planning_to_feed(UUID) TO authenticated;

-- ── Backfill : les posts déjà publiés gardent leur ancien texte figé ─────────
-- Les convocations match peuvent être regénérées depuis le match lié (comme
-- 20260906120000 le faisait déjà). Le planning et les convocations
-- entraînement n'ont pas d'équivalent regénérable proprement (le digest
-- planning dépend d'une fenêtre glissante "7 prochains jours" qui a bougé
-- depuis la publication) : on ne les corrige donc pas rétroactivement, seuls
-- les futurs partages utilisent le nouveau format.
DO $backfill$
DECLARE
  v_updated INT;
BEGIN
  UPDATE team_posts p
  SET content = f.new_content
  FROM (
    SELECT
      tp.id,
      _format_match_convocation(substring(tp.link_url FROM '[0-9a-fA-F-]{36}$')::uuid) AS new_content
    FROM team_posts tp
    WHERE tp.post_type = 'convocation'
      AND tp.link_url LIKE '/(tabs)/calendar/matchDetail/%'
  ) f
  WHERE p.id = f.id
    AND f.new_content IS NOT NULL
    AND f.new_content <> p.content;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Backfill format heure convocation match : % post(s) regénéré(s)', v_updated;
END;
$backfill$;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = '_format_match_convocation'
      AND has_function_privilege('public', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION '_format_match_convocation ne doit pas être exécutable par PUBLIC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'share_convocation_to_feed'
      AND has_function_privilege('public', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'share_convocation_to_feed ne doit pas être exécutable par PUBLIC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'share_weekly_planning_to_feed'
      AND has_function_privilege('public', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'share_weekly_planning_to_feed ne doit pas être exécutable par PUBLIC';
  END IF;
END;
$verify$;
