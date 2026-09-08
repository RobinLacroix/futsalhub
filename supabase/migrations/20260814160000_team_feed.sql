-- ─────────────────────────────────────────────────────────────────────────────
-- team_feed : fil d'équipe V1 (socle)
--   Spec : docs/superpowers/specs/2026-08-14-fil-equipe-v1-design.md
--
--   - team_posts        : 1 post = 1 annonce staff, scopée équipe
--   - team_post_tags     : joueurs mentionnés dans un post
--   - team_post_comments : échanges staff + joueurs sous un post
--
--   Écriture 100% via RPC SECURITY DEFINER. Aucune policy INSERT/UPDATE/DELETE :
--   c'est précisément la classe de bug qu'on vient de corriger côté création de
--   joueur mobile (policy INSERT dépendante d'une colonne que l'appli ne
--   renseignait plus). Les RPC vérifient elles-mêmes has_team_access /
--   has_team_write_access et font le soft delete via UPDATE, qui n'a pas besoin
--   de policy puisqu'il s'exécute sous l'identité du propriétaire de la fonction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES auth.users(id),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.team_post_tags (
  post_id    UUID NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.team_post_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID        NOT NULL REFERENCES team_posts(id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES auth.users(id),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_posts_team_created  ON public.team_posts(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_post_tags_player    ON public.team_post_tags(player_id);
CREATE INDEX IF NOT EXISTS idx_team_post_comments_post  ON public.team_post_comments(post_id, created_at);

COMMENT ON TABLE public.team_posts IS 'Fil d''équipe V1 : annonces du staff, scopées par équipe.';
COMMENT ON TABLE public.team_post_tags IS 'Joueurs mentionnés dans un post du fil.';
COMMENT ON TABLE public.team_post_comments IS 'Commentaires staff + joueurs sous un post du fil.';

-- ── Garde d'accès : lecture = staff OU joueur de l'équipe ──────────────────────
-- has_team_access (comme has_club_access) ne couvre QUE le staff (club_members) :
-- vérifié sur la base réelle, aucun des deux ne suit la relation player_teams.
-- Le fil doit être lisible par le staff ET les joueurs de l'équipe : la lecture
-- seule (has_team_access) ne suffit pas, il faut l'étendre explicitement.
-- Pas de préfixe `_` : comme has_team_access, elle est évaluée dans des policies
-- RLS sous l'identité de l'appelant, donc GRANT à authenticated obligatoire (les
-- helpers `_`-préfixés ne sont eux appelés que depuis d'autres fonctions
-- SECURITY DEFINER, jamais depuis une policy RLS). Définie avant les policies
-- ci-dessous : CREATE POLICY résout la fonction référencée dans USING
-- immédiatement, elle doit donc déjà exister.
CREATE OR REPLACE FUNCTION has_team_feed_access(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_team_access(p_team_id)
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players pl ON pl.id = pt.player_id
      WHERE pt.team_id = p_team_id AND pl.user_id = auth.uid()
    );
$$;

-- ── Helper interne : nom d'affichage d'un auteur ───────────────────────────────
CREATE OR REPLACE FUNCTION _team_feed_author_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
    u.email,
    'Membre du staff'
  )
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

-- ── RLS : lecture seule, écriture 100% via RPC ─────────────────────────────────
ALTER TABLE public.team_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_post_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_posts_select" ON public.team_posts;
CREATE POLICY "team_posts_select" ON public.team_posts
  FOR SELECT USING (has_team_feed_access(team_id));

DROP POLICY IF EXISTS "team_post_tags_select" ON public.team_post_tags;
CREATE POLICY "team_post_tags_select" ON public.team_post_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_posts p WHERE p.id = team_post_tags.post_id AND has_team_feed_access(p.team_id))
  );

DROP POLICY IF EXISTS "team_post_comments_select" ON public.team_post_comments;
CREATE POLICY "team_post_comments_select" ON public.team_post_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_posts p WHERE p.id = team_post_comments.post_id AND has_team_feed_access(p.team_id))
  );

-- ── RPC 1 : publier un post (staff uniquement) ─────────────────────────────────
CREATE OR REPLACE FUNCTION create_team_post(
  p_team_id     UUID,
  p_content     TEXT,
  p_player_tags UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content  TEXT := trim(COALESCE(p_content, ''));
  v_post_id  UUID;
  v_author   TEXT;
  v_tag_id   UUID;
BEGIN
  IF NOT has_team_write_access(p_team_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_content = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_content');
  END IF;

  INSERT INTO public.team_posts (team_id, author_user_id, content)
  VALUES (p_team_id, auth.uid(), v_content)
  RETURNING id INTO v_post_id;

  v_author := _team_feed_author_name(auth.uid());

  -- Seuls les joueurs de l'équipe du post peuvent être taggés (pas de fuite cross-équipe).
  FOR v_tag_id IN
    SELECT DISTINCT t.player_id
    FROM unnest(COALESCE(p_player_tags, '{}')) AS t(player_id)
    JOIN player_teams pt ON pt.player_id = t.player_id AND pt.team_id = p_team_id
  LOOP
    INSERT INTO public.team_post_tags (post_id, player_id) VALUES (v_post_id, v_tag_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT p.user_id, 'post_tag',
           v_author || ' vous a mentionné',
           left(v_content, 140),
           jsonb_build_object('post_id', v_post_id::text, 'team_id', p_team_id::text)
    FROM players p
    WHERE p.id = v_tag_id AND p.user_id IS NOT NULL;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

-- ── RPC 2 : modifier un post (auteur uniquement) ───────────────────────────────
CREATE OR REPLACE FUNCTION update_team_post(p_post_id UUID, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content TEXT := trim(COALESCE(p_content, ''));
  v_author  UUID;
BEGIN
  SELECT author_user_id INTO v_author FROM team_posts WHERE id = p_post_id AND deleted_at IS NULL;
  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM v_author THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_content = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_content');
  END IF;

  UPDATE team_posts SET content = v_content, edited_at = now() WHERE id = p_post_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC 3 : supprimer un post (auteur ou staff, soft delete) ──────────────────
CREATE OR REPLACE FUNCTION delete_team_post(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author  UUID;
  v_team_id UUID;
BEGIN
  SELECT author_user_id, team_id INTO v_author, v_team_id
  FROM team_posts WHERE id = p_post_id AND deleted_at IS NULL;
  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF NOT (auth.uid() IS NOT NULL AND (auth.uid() = v_author OR has_team_write_access(v_team_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  UPDATE team_posts SET deleted_at = now() WHERE id = p_post_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC 4 : fil paginé d'une équipe ─────────────────────────────────────────────
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

  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.id,
      p.team_id,
      p.author_user_id,
      _team_feed_author_name(p.author_user_id) AS author_name,
      p.content,
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

-- ── RPC 4bis : un seul post (écran de détail, après navigation depuis le fil) ──
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

-- ── RPC 5 : ajouter un commentaire (staff + joueurs de l'équipe) ──────────────
CREATE OR REPLACE FUNCTION add_post_comment(p_post_id UUID, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content     TEXT := trim(COALESCE(p_content, ''));
  v_team_id     UUID;
  v_post_author UUID;
  v_comment_id  UUID;
  v_commenter   TEXT;
BEGIN
  SELECT team_id, author_user_id INTO v_team_id, v_post_author
  FROM team_posts WHERE id = p_post_id AND deleted_at IS NULL;
  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF NOT has_team_feed_access(v_team_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_content = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_content');
  END IF;

  INSERT INTO team_post_comments (post_id, author_user_id, content)
  VALUES (p_post_id, auth.uid(), v_content)
  RETURNING id INTO v_comment_id;

  IF v_post_author IS DISTINCT FROM auth.uid() THEN
    v_commenter := _team_feed_author_name(auth.uid());
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_post_author, 'post_comment',
      v_commenter || ' a commenté votre post',
      left(v_content, 140),
      jsonb_build_object('post_id', p_post_id::text, 'team_id', v_team_id::text)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'comment_id', v_comment_id);
END;
$$;

-- ── RPC 6 : modifier un commentaire (auteur uniquement) ────────────────────────
CREATE OR REPLACE FUNCTION update_post_comment(p_comment_id UUID, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content TEXT := trim(COALESCE(p_content, ''));
  v_author  UUID;
BEGIN
  SELECT author_user_id INTO v_author FROM team_post_comments WHERE id = p_comment_id AND deleted_at IS NULL;
  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM v_author THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_content = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_content');
  END IF;

  UPDATE team_post_comments SET content = v_content, edited_at = now() WHERE id = p_comment_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC 7 : supprimer un commentaire (auteur ou staff, soft delete) ───────────
CREATE OR REPLACE FUNCTION delete_post_comment(p_comment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author  UUID;
  v_team_id UUID;
BEGIN
  SELECT c.author_user_id, p.team_id INTO v_author, v_team_id
  FROM team_post_comments c
  JOIN team_posts p ON p.id = c.post_id
  WHERE c.id = p_comment_id AND c.deleted_at IS NULL;
  IF v_author IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF NOT (auth.uid() IS NOT NULL AND (auth.uid() = v_author OR has_team_write_access(v_team_id))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  UPDATE team_post_comments SET deleted_at = now() WHERE id = p_comment_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC 8 : commentaires d'un post ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_post_comments(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
  v_result  JSONB;
BEGIN
  SELECT team_id INTO v_team_id FROM team_posts WHERE id = p_post_id;
  IF v_team_id IS NULL OR NOT has_team_feed_access(v_team_id) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(cm) ORDER BY cm.created_at ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.id, c.post_id, c.author_user_id, _team_feed_author_name(c.author_user_id) AS author_name,
           c.content, c.created_at, c.edited_at
    FROM team_post_comments c
    WHERE c.post_id = p_post_id AND c.deleted_at IS NULL
  ) cm;

  RETURN v_result;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
-- Défaut Postgres : EXECUTE est accordé à PUBLIC à la création, et sous Supabase
-- anon/authenticated sont membres de PUBLIC. REVOKE explicite obligatoire (cf.
-- garde-fou §15 de 20260803100000) : un GRANT à authenticated seul n'enlève rien.
REVOKE ALL ON FUNCTION has_team_feed_access(UUID)           FROM PUBLIC;
REVOKE ALL ON FUNCTION _team_feed_author_name(UUID)        FROM PUBLIC;
REVOKE ALL ON FUNCTION create_team_post(UUID, TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_team_post(UUID, TEXT)         FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_team_post(UUID)               FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_feed(UUID, INT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_post(UUID)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION add_post_comment(UUID, TEXT)         FROM PUBLIC;
REVOKE ALL ON FUNCTION update_post_comment(UUID, TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_post_comment(UUID)            FROM PUBLIC;
REVOKE ALL ON FUNCTION get_post_comments(UUID)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION has_team_feed_access(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION create_team_post(UUID, TEXT, UUID[])  TO authenticated;
GRANT EXECUTE ON FUNCTION update_team_post(UUID, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION delete_team_post(UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_feed(UUID, INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_post(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION add_post_comment(UUID, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION update_post_comment(UUID, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION delete_post_comment(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION get_post_comments(UUID)               TO authenticated;
-- _team_feed_author_name reste appelable seulement par les fonctions ci-dessus
-- (SECURITY DEFINER) : aucun GRANT direct à authenticated.

-- ── Badge : ajouter 'post_tag' au compteur de notifications ──────────────────
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
    'post_tag',                COUNT(*) FILTER (WHERE type = 'post_tag'),
    'post_comment',            COUNT(*) FILTER (WHERE type = 'post_comment'),
    'total',                  COUNT(*)
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;

-- ── Vérification : aucune fonction du fil exécutable par PUBLIC ───────────────
DO $mig$
DECLARE
  v_leak TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'has_team_feed_access','_team_feed_author_name','create_team_post','update_team_post','delete_team_post',
      'get_team_feed','get_team_post','add_post_comment','update_post_comment','delete_post_comment','get_post_comments'
    )
    AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions du fil encore exécutables par PUBLIC : %', v_leak;
  END IF;

  RAISE NOTICE 'OK : fonctions du fil d''équipe verrouillées (PUBLIC révoqué).';
END
$mig$;
