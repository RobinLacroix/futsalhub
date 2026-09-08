-- Demande : le texte de convocation partagé dans le fil ("Convocation : Match vs
-- X le DD/MM à HHhMM — location (N joueurs convoqués)") est une phrase plate qui
-- ne montre ni l'adresse, ni l'heure de rendez-vous, ni le message du coach, ni
-- qui est convoqué. On enrichit share_convocation_to_feed (20260814170000) pour
-- le branche match : mise en page multiligne, en s'appuyant sur les 3 colonnes
-- ajoutées par 20260827130000 (venue_address, meeting_time, convocation_message).
-- Branche entraînement inchangée (hors scope de la demande).

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
  v_opponent    TEXT;
  v_count       INT;
  v_date_label  TEXT;
  v_content     TEXT;
  v_link        TEXT;
  v_post_id     UUID;
  v_venue       TEXT;
  v_meeting     TIMESTAMPTZ;
  v_message     TEXT;
  v_names       TEXT;
  v_lines       TEXT[];
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

    v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');
    v_content := 'Convocation : Entraînement le ' || v_date_label
      || COALESCE(' — ' || v_location, '')
      || ' (' || v_count || ' joueur' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ' convoqué'
      || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ')';
    v_link := '/(tabs)/calendar/training/' || p_training_id::text;
  ELSE
    SELECT team_id, date, location, opponent_team, venue_address, meeting_time, convocation_message,
           jsonb_array_length(COALESCE(players, '[]'::jsonb))
    INTO v_team_id, v_date, v_location, v_opponent, v_venue, v_meeting, v_message, v_count
    FROM matches WHERE id = p_match_id;
    IF v_team_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
    IF NOT has_team_write_access(v_team_id) THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
    IF COALESCE(v_count, 0) = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_convocation'); END IF;

    -- Noms des joueurs convoqués, triés par nom de famille. Cap à 16 noms pour
    -- ne pas produire un pavé illisible sur un gros effectif (rare en futsal).
    SELECT string_agg(pl.first_name || ' ' || pl.last_name, ', ' ORDER BY pl.last_name, pl.first_name)
    INTO v_names
    FROM (
      SELECT DISTINCT elem->>'id' AS player_id
      FROM matches m, jsonb_array_elements(m.players) AS elem
      WHERE m.id = p_match_id
    ) ids
    JOIN players pl ON pl.id = (ids.player_id)::UUID;

    IF v_count > 16 THEN
      SELECT string_agg(pl.first_name || ' ' || pl.last_name, ', ' ORDER BY pl.last_name, pl.first_name)
      INTO v_names
      FROM (
        SELECT DISTINCT elem->>'id' AS player_id
        FROM matches m, jsonb_array_elements(m.players) AS elem
        WHERE m.id = p_match_id
        LIMIT 16
      ) ids
      JOIN players pl ON pl.id = (ids.player_id)::UUID;
      v_names := v_names || ' et ' || (v_count - 16) || ' autre' || CASE WHEN v_count - 16 > 1 THEN 's' ELSE '' END;
    END IF;

    v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');

    v_lines := ARRAY['📋 Convocation : Match' || COALESCE(' vs ' || v_opponent, '') || ' — ' || v_date_label];
    IF v_meeting IS NOT NULL THEN
      v_lines := array_append(v_lines, '🕒 Rendez-vous à ' || to_char(v_meeting AT TIME ZONE 'Europe/Paris', 'HH24:MI'));
    END IF;
    IF COALESCE(v_venue, v_location) IS NOT NULL THEN
      v_lines := array_append(v_lines, '📍 ' || COALESCE(v_venue, v_location));
    END IF;
    v_lines := array_append(
      v_lines,
      '👥 ' || v_count || ' joueur' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ' convoqué'
        || CASE WHEN v_count > 1 THEN 's' ELSE '' END || COALESCE(' : ' || v_names, '')
    );
    IF v_message IS NOT NULL AND trim(v_message) <> '' THEN
      v_lines := array_append(v_lines, '✉️ ' || v_message);
    END IF;

    v_content := array_to_string(v_lines, E'\n');
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

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc WHERE proname = 'share_convocation_to_feed';
  IF v_src NOT ILIKE '%venue_address%' OR v_src NOT ILIKE '%meeting_time%' THEN
    RAISE EXCEPTION 'share_convocation_to_feed devrait référencer venue_address et meeting_time après cette migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'share_convocation_to_feed'
      AND has_function_privilege('public', oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'share_convocation_to_feed ne doit pas être exécutable par PUBLIC';
  END IF;
END;
$verify$;
