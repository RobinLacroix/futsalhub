-- ─────────────────────────────────────────────────────────────────────────────
-- Demande Robin : le message de convocation match posté dans le fil doit être
-- structuré en 3 sections aérées (ligne vide entre chacune) :
--   1. Informations générales : nom du match, date/heure de coup d'envoi,
--      heure de rendez-vous, lieu.
--   2. Joueurs convoqués : gardiens d'abord, puis joueurs de champ.
--   3. Message du coach (si renseigné).
-- Demande explicite : rétroactif, donc on regénère aussi le contenu des posts
-- de convocation match déjà publiés dans le fil (pas seulement les futurs).
--
-- Branche entraînement inchangée (déjà hors scope de 20260827140000, la
-- demande ne porte que sur les champs match : coup d'envoi, lieu, etc.).
--
-- Extraction de la logique de formatage dans _format_match_convocation pour
-- pouvoir la réutiliser aussi bien depuis share_convocation_to_feed (poste un
-- nouveau message) que depuis le backfill ci-dessous (regénère le contenu
-- d'un post existant à partir du match lié).
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

  v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');

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

-- ── share_convocation_to_feed : branche match déléguée au helper ─────────────

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

    v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');
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

-- ── Backfill rétroactif ────────────────────────────────────────────────────
-- Regénère le contenu des posts de convocation match déjà publiés, à partir
-- de l'état ACTUEL du match lié (via l'UUID en fin de link_url). N'écrit pas
-- edited_at : ce n'est pas une édition du coach, et le tag "· modifié" côté
-- app afficherait un mensonge aux joueurs qui ont déjà lu ce post.
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
  RAISE NOTICE 'Backfill convocation match : % post(s) regénéré(s)', v_updated;
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
END;
$verify$;
