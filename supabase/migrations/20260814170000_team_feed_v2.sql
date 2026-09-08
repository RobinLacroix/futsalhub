-- ─────────────────────────────────────────────────────────────────────────────
-- team_feed V2 : posts système (anniversaire, convocation, planning, vidéo)
--   Spec : docs/superpowers/specs/2026-08-14-fil-equipe-v2-design.md
--   Étend team_posts (V1, supabase/migrations/20260814160000_team_feed.sql),
--   non cassant : post_type défaut 'manual', link_url nullable.
--
--   - convocation/planning/vidéo : déclenchés par un bouton staff (auth.uid()
--     reste l'auteur, comme un post manuel).
--   - anniversaire : seul cas sans humain à l'origine. Calculé À LA LECTURE
--     dans get_team_feed (pas de pg_cron, non installé sur le projet) —
--     team_feed_birthday_log garantit l'idempotence (1 post/joueur/an max).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS link_url  TEXT;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_posts_post_type_check'
  ) THEN
    ALTER TABLE public.team_posts
      ADD CONSTRAINT team_posts_post_type_check
      CHECK (post_type IN ('manual','birthday','convocation','planning','video'));
  END IF;
END
$mig$;

CREATE TABLE IF NOT EXISTS public.team_feed_birthday_log (
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  birthday_year INT  NOT NULL,
  post_id       UUID REFERENCES team_posts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, player_id, birthday_year)
);

COMMENT ON TABLE public.team_feed_birthday_log IS
  'Idempotence des posts anniversaire du fil : 1 ligne max par joueur/équipe/année.';

ALTER TABLE public.team_feed_birthday_log ENABLE ROW LEVEL SECURITY;
-- Pas de policy : table purement technique, lue/écrite uniquement par
-- _ensure_birthday_posts (SECURITY DEFINER). RLS activée = deny-by-default.

-- ── Interne : crée les posts anniversaire du jour, une fois par joueur/an ─────
CREATE OR REPLACE FUNCTION _ensure_birthday_posts(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player   RECORD;
  v_admin_id UUID;
  v_year     INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
BEGIN
  FOR v_player IN
    SELECT id, first_name
    FROM players
    WHERE team_id = p_team_id
      AND status = 'active'
      AND birth_date IS NOT NULL
      AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM birth_date)   = EXTRACT(DAY FROM CURRENT_DATE)
  LOOP
    INSERT INTO team_feed_birthday_log (team_id, player_id, birthday_year)
    VALUES (p_team_id, v_player.id, v_year)
    ON CONFLICT DO NOTHING;

    -- FOUND = true seulement si l'INSERT a réellement écrit une ligne (pas un
    -- conflit) : garantit qu'on ne poste qu'une fois par joueur et par année,
    -- même si le fil est ouvert par dix personnes le même jour.
    IF FOUND THEN
      SELECT cm.user_id INTO v_admin_id
      FROM club_members cm
      JOIN teams t ON t.id = p_team_id
      WHERE cm.club_id = t.club_id AND cm.role = 'admin'
      ORDER BY cm.created_at ASC
      LIMIT 1;

      -- Club sans admin (ne devrait pas arriver) : le log est déjà posé, on
      -- n'insiste pas indéfiniment à chaque appel, on saute juste le post.
      IF v_admin_id IS NOT NULL THEN
        INSERT INTO team_posts (team_id, author_user_id, content, post_type)
        VALUES (p_team_id, v_admin_id, '🎂 Joyeux anniversaire ' || v_player.first_name || ' !', 'birthday');
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ── RPC : partager une convocation (entraînement OU match) ────────────────────
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
  v_team_id    UUID;
  v_date       TIMESTAMPTZ;
  v_location   TEXT;
  v_opponent   TEXT;
  v_count      INT;
  v_date_label TEXT;
  v_content    TEXT;
  v_link       TEXT;
  v_post_id    UUID;
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
    SELECT team_id, date, location, opponent_team, jsonb_array_length(COALESCE(players, '[]'::jsonb))
    INTO v_team_id, v_date, v_location, v_opponent, v_count
    FROM matches WHERE id = p_match_id;
    IF v_team_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
    IF NOT has_team_write_access(v_team_id) THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
    IF COALESCE(v_count, 0) = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_convocation'); END IF;

    v_date_label := to_char(v_date AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24h');
    v_content := 'Convocation : Match' || COALESCE(' vs ' || v_opponent, '') || ' le ' || v_date_label
      || COALESCE(' — ' || v_location, '')
      || ' (' || v_count || ' joueur' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ' convoqué'
      || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ')';
    v_link := '/(tabs)/calendar/matchDetail/' || p_match_id::text;
  END IF;

  INSERT INTO team_posts (team_id, author_user_id, content, post_type, link_url)
  VALUES (v_team_id, auth.uid(), v_content, 'convocation', v_link)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

-- ── RPC : partager le planning des 7 prochains jours ───────────────────────────
CREATE OR REPLACE FUNCTION share_weekly_planning_to_feed(p_team_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     RECORD;
  v_lines   TEXT[] := '{}';
  v_content TEXT;
  v_post_id UUID;
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

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

-- ── RPC : partager un contenu du module Partage ────────────────────────────────
CREATE OR REPLACE FUNCTION share_video_to_feed(p_shared_content_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_title   TEXT;
  v_url     TEXT;
  v_post_id UUID;
BEGIN
  SELECT team_id, title, url INTO v_team_id, v_title, v_url
  FROM shared_content WHERE id = p_shared_content_id;
  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF NOT has_team_write_access(v_team_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  INSERT INTO team_posts (team_id, author_user_id, content, post_type, link_url)
  VALUES (v_team_id, auth.uid(), 'Nouvelle vidéo : ' || v_title, 'video', v_url)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

-- ── get_team_feed / get_team_post : + post_type, link_url, + anniversaires ────
CREATE OR REPLACE FUNCTION get_team_feed(
  p_team_id UUID,
  p_limit   INT DEFAULT 20,
  p_before  TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT has_team_feed_access(p_team_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  PERFORM _ensure_birthday_posts(p_team_id);

  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id,
      p.team_id,
      p.author_user_id,
      _team_feed_author_name(p.author_user_id) AS author_name,
      p.content,
      p.post_type,
      p.link_url,
      p.created_at,
      p.edited_at,
      (SELECT COUNT(*) FROM team_post_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('player_id', pl.id, 'first_name', pl.first_name, 'last_name', pl.last_name))
        FROM team_post_tags tt
        JOIN players pl ON pl.id = tt.player_id
        WHERE tt.post_id = p.id
      ), '[]'::jsonb) AS tags
    FROM team_posts p
    WHERE p.team_id = p_team_id
      AND p.deleted_at IS NULL
      AND (p_before IS NULL OR p.created_at < p_before)
    ORDER BY p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) f;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_team_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_result  JSONB;
BEGIN
  SELECT team_id INTO v_team_id FROM team_posts WHERE id = p_post_id AND deleted_at IS NULL;
  IF v_team_id IS NULL OR NOT has_team_feed_access(v_team_id) THEN
    RETURN NULL;
  END IF;

  SELECT row_to_json(f)::jsonb INTO v_result
  FROM (
    SELECT
      p.id,
      p.team_id,
      p.author_user_id,
      _team_feed_author_name(p.author_user_id) AS author_name,
      p.content,
      p.post_type,
      p.link_url,
      p.created_at,
      p.edited_at,
      (SELECT COUNT(*) FROM team_post_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('player_id', pl.id, 'first_name', pl.first_name, 'last_name', pl.last_name))
        FROM team_post_tags tt
        JOIN players pl ON pl.id = tt.player_id
        WHERE tt.post_id = p.id
      ), '[]'::jsonb) AS tags
    FROM team_posts p
    WHERE p.id = p_post_id
  ) f;

  RETURN v_result;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION _ensure_birthday_posts(UUID)                FROM PUBLIC;
REVOKE ALL ON FUNCTION share_convocation_to_feed(UUID, UUID)       FROM PUBLIC;
REVOKE ALL ON FUNCTION share_weekly_planning_to_feed(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION share_video_to_feed(UUID)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_feed(UUID, INT, TIMESTAMPTZ)       FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_post(UUID)                         FROM PUBLIC;

GRANT EXECUTE ON FUNCTION share_convocation_to_feed(UUID, UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION share_weekly_planning_to_feed(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION share_video_to_feed(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_feed(UUID, INT, TIMESTAMPTZ)     TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_post(UUID)                       TO authenticated;
-- _ensure_birthday_posts reste interne (appelée uniquement par get_team_feed,
-- SECURITY DEFINER) : aucun GRANT direct à authenticated.

-- ── Vérification : aucune fonction du fil V2 exécutable par PUBLIC ────────────
DO $mig$
DECLARE
  v_leak TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      '_ensure_birthday_posts','share_convocation_to_feed','share_weekly_planning_to_feed',
      'share_video_to_feed','get_team_feed','get_team_post'
    )
    AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions du fil V2 encore exécutables par PUBLIC : %', v_leak;
  END IF;

  RAISE NOTICE 'OK : fonctions du fil d''équipe V2 verrouillées (PUBLIC révoqué).';
END
$mig$;
