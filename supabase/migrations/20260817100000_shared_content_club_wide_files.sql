-- ─────────────────────────────────────────────────────────────────────────────
-- shared_content / shared_content_folders : partage au niveau du CLUB + fichiers
--
--   Jusqu'ici : shared_content.team_id NOT NULL (toujours scopé équipe),
--   content_type limité à 'youtube'/'link' (pas de vrai fichier, pas de
--   storage bucket dans tout le projet).
--
--   Ce qui change :
--   1. club_id ajouté sur les deux tables, team_id devient nullable.
--      team_id IS NULL = contenu/dossier partagé à TOUTES les équipes du club
--      (même convention que club_members.team_id IS NULL = admin de club).
--      Un trigger dérive club_id depuis team_id quand team_id est fourni
--      (empêche un club_id spoofé côté client sur du contenu team-scopé).
--   2. content_type + 'file', avec file_path/file_size_bytes/file_mime_type.
--      Bucket storage privé 'shared-content', 50 Mo max, PDF/image/vidéo
--      courte. Path : {club_id}/{team_id|'club'}/{timestamp}-{filename} —
--      la RLS sur storage.objects ne lit que les 2 premiers segments.
--   3. Partage club-wide réservé aux ADMINS de club (is_club_admin), décision
--      actée avec Robin le 2026-08-17 : un coach mono-équipe ne doit pas
--      pouvoir publier vers des équipes qu'il ne gère pas.
--   4. RLS réécrite pour lire club_id directement (simplifie le join teams
--      qui existait uniquement pour remonter jusqu'à club_id).
--   5. get_my_shared_content/folders (joueur) et les nouvelles
--      get_team_shared_content/folders (coach, remplacent les .from() directs
--      des services) élargies pour inclure le contenu club-wide du club du
--      joueur/de l'équipe.
--
--   Tightening assumé (signalé, pas silencieux) : l'ancienne policy INSERT de
--   shared_content vérifiait seulement club_id + role IN ('admin','coach'),
--   SANS vérifier que le coach appelant est bien coach DE CETTE équipe — un
--   coach de l'équipe A pouvait déjà publier sur l'équipe B du même club.
--   La réécriture utilise has_team_write_access (scope correct, primitive
--   existante) : ce comportement se resserre. Fonctionnel, pas juste
--   sécurité — assumé dans ce ticket plutôt que scindé, cf. CLAUDE.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Colonnes : club_id, team_id nullable, colonnes fichier ─────────────────

ALTER TABLE public.shared_content
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS file_mime_type TEXT;

ALTER TABLE public.shared_content_folders
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE;

UPDATE public.shared_content sc
SET club_id = t.club_id
FROM public.teams t
WHERE sc.team_id = t.id AND sc.club_id IS NULL;

UPDATE public.shared_content_folders scf
SET club_id = t.club_id
FROM public.teams t
WHERE scf.team_id = t.id AND scf.club_id IS NULL;

DO $mig$
DECLARE
  v_orphans INT;
BEGIN
  SELECT COUNT(*) INTO v_orphans FROM public.shared_content WHERE club_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'shared_content : % ligne(s) sans club_id après backfill (team_id orphelin ?)', v_orphans;
  END IF;
  SELECT COUNT(*) INTO v_orphans FROM public.shared_content_folders WHERE club_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'shared_content_folders : % ligne(s) sans club_id après backfill', v_orphans;
  END IF;
END
$mig$;

ALTER TABLE public.shared_content ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.shared_content ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE public.shared_content ALTER COLUMN url DROP NOT NULL;

ALTER TABLE public.shared_content_folders ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.shared_content_folders ALTER COLUMN team_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sc_club  ON public.shared_content(club_id);
CREATE INDEX IF NOT EXISTS idx_scf_club ON public.shared_content_folders(club_id);

-- content_type : + 'file' (nom de contrainte auto-générée à l'origine, non fiable)
DO $mig$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.shared_content'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%content_type%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shared_content DROP CONSTRAINT %I', v_conname);
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_content_content_type_check') THEN
    ALTER TABLE public.shared_content
      ADD CONSTRAINT shared_content_content_type_check
      CHECK (content_type IN ('youtube', 'link', 'file'));
  END IF;
END
$mig$;

-- Cohérence url/fichier selon content_type
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_content_file_or_url_check') THEN
    ALTER TABLE public.shared_content
      ADD CONSTRAINT shared_content_file_or_url_check
      CHECK (
        (content_type = 'file' AND file_path IS NOT NULL AND url IS NULL)
        OR
        (content_type IN ('youtube', 'link') AND url IS NOT NULL AND file_path IS NULL)
      );
  END IF;
END
$mig$;

-- Plafond 50 Mo, doublé côté bucket storage (défense en profondeur)
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_content_file_size_check') THEN
    ALTER TABLE public.shared_content
      ADD CONSTRAINT shared_content_file_size_check
      CHECK (file_size_bytes IS NULL OR file_size_bytes <= 52428800);
  END IF;
END
$mig$;

-- ── 2. Trigger : dérive club_id depuis team_id, empêche le spoof ──────────────

CREATE OR REPLACE FUNCTION _shared_content_scope_set_club_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    SELECT club_id INTO NEW.club_id FROM teams WHERE id = NEW.team_id;
    IF NEW.club_id IS NULL THEN
      RAISE EXCEPTION 'team_id % invalide ou sans club', NEW.team_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_content_set_club_id ON public.shared_content;
CREATE TRIGGER trg_shared_content_set_club_id
  BEFORE INSERT OR UPDATE ON public.shared_content
  FOR EACH ROW EXECUTE FUNCTION _shared_content_scope_set_club_id();

DROP TRIGGER IF EXISTS trg_shared_content_folders_set_club_id ON public.shared_content_folders;
CREATE TRIGGER trg_shared_content_folders_set_club_id
  BEFORE INSERT OR UPDATE ON public.shared_content_folders
  FOR EACH ROW EXECUTE FUNCTION _shared_content_scope_set_club_id();

-- ── 3. RLS : shared_content ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shared_content_select" ON public.shared_content;
CREATE POLICY "shared_content_select" ON public.shared_content
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = shared_content.club_id AND cm.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players p ON p.id = pt.player_id
      JOIN teams t  ON t.id = pt.team_id
      WHERE p.user_id = auth.uid()
        AND (pt.team_id = shared_content.team_id OR (shared_content.team_id IS NULL AND t.club_id = shared_content.club_id))
    )
  );

DROP POLICY IF EXISTS "shared_content_insert" ON public.shared_content;
CREATE POLICY "shared_content_insert" ON public.shared_content
  FOR INSERT
  WITH CHECK (
    (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  );

DROP POLICY IF EXISTS "shared_content_delete" ON public.shared_content;
CREATE POLICY "shared_content_delete" ON public.shared_content
  FOR DELETE
  USING (created_by = auth.uid() OR is_club_admin(club_id));

-- ── 4. RLS : shared_content_folders ────────────────────────────────────────────

DROP POLICY IF EXISTS "scf_select" ON public.shared_content_folders;
CREATE POLICY "scf_select" ON public.shared_content_folders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = shared_content_folders.club_id AND cm.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM player_teams pt
      JOIN players p ON p.id = pt.player_id
      JOIN teams t  ON t.id = pt.team_id
      WHERE p.user_id = auth.uid()
        AND (pt.team_id = shared_content_folders.team_id OR (shared_content_folders.team_id IS NULL AND t.club_id = shared_content_folders.club_id))
    )
  );

DROP POLICY IF EXISTS "scf_insert" ON public.shared_content_folders;
CREATE POLICY "scf_insert" ON public.shared_content_folders
  FOR INSERT WITH CHECK (
    (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  );

DROP POLICY IF EXISTS "scf_update" ON public.shared_content_folders;
CREATE POLICY "scf_update" ON public.shared_content_folders
  FOR UPDATE
  USING (
    (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  )
  WITH CHECK (
    (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  );

DROP POLICY IF EXISTS "scf_delete" ON public.shared_content_folders;
CREATE POLICY "scf_delete" ON public.shared_content_folders
  FOR DELETE USING (created_by = auth.uid() OR is_club_admin(club_id));

-- ── 5. Storage bucket + RLS ─────────────────────────────────────────────────────
-- Path convention : {club_id}/{team_id | 'club'}/{timestamp}-{filename}
-- La RLS ne lit que les 2 premiers segments (storage.foldername) ; le nom de
-- fichier final n'a aucun rôle dans l'autorisation.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared-content', 'shared-content', false, 52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Cast texte->uuid sans exception : un chemin malformé doit juste échouer la
-- policy (refus d'accès), jamais faire planter la requête avec une erreur SQL.
CREATE OR REPLACE FUNCTION _safe_uuid(p_text TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "shared_content_files_select" ON storage.objects;
CREATE POLICY "shared_content_files_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'shared-content'
    AND (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.user_id = auth.uid() AND cm.club_id = _safe_uuid((storage.foldername(name))[1])
      )
      OR EXISTS (
        SELECT 1 FROM player_teams pt
        JOIN players p ON p.id = pt.player_id
        JOIN teams t  ON t.id = pt.team_id
        WHERE p.user_id = auth.uid()
          AND t.club_id = _safe_uuid((storage.foldername(name))[1])
          AND ((storage.foldername(name))[2] = 'club' OR pt.team_id = _safe_uuid((storage.foldername(name))[2]))
      )
    )
  );

DROP POLICY IF EXISTS "shared_content_files_insert" ON storage.objects;
CREATE POLICY "shared_content_files_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'shared-content'
    AND (
      ((storage.foldername(name))[2] = 'club' AND is_club_admin(_safe_uuid((storage.foldername(name))[1])))
      OR ((storage.foldername(name))[2] <> 'club' AND has_team_write_access(_safe_uuid((storage.foldername(name))[2])))
    )
  );

DROP POLICY IF EXISTS "shared_content_files_delete" ON storage.objects;
CREATE POLICY "shared_content_files_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'shared-content'
    AND (
      owner = auth.uid()
      OR ((storage.foldername(name))[2] = 'club' AND is_club_admin(_safe_uuid((storage.foldername(name))[1])))
      OR ((storage.foldername(name))[2] <> 'club' AND has_team_write_access(_safe_uuid((storage.foldername(name))[2])))
    )
  );

-- ── 6. RPC joueur : élargir aux items club-wide ────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_shared_content()
RETURNS SETOF public.shared_content
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT sc.*
  FROM shared_content sc
  JOIN player_teams pt ON pt.player_id = v_player_id
  JOIN teams t ON t.id = pt.team_id
  WHERE sc.team_id = pt.team_id OR (sc.team_id IS NULL AND sc.club_id = t.club_id)
  ORDER BY sc.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_shared_folders()
RETURNS SETOF public.shared_content_folders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT scf.*
  FROM shared_content_folders scf
  JOIN player_teams pt ON pt.player_id = v_player_id
  JOIN teams t ON t.id = pt.team_id
  WHERE scf.team_id = pt.team_id OR (scf.team_id IS NULL AND scf.club_id = t.club_id)
  ORDER BY scf.name;
END;
$$;

-- ── 7. RPC coach : liste équipe + club-wide (remplace les .from() directs) ────

CREATE OR REPLACE FUNCTION get_team_shared_content(p_team_id UUID)
RETURNS SETOF public.shared_content
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF NOT has_team_access(p_team_id) THEN RETURN; END IF;
  SELECT club_id INTO v_club_id FROM teams WHERE id = p_team_id;

  RETURN QUERY
  SELECT sc.*
  FROM shared_content sc
  WHERE sc.team_id = p_team_id OR (sc.team_id IS NULL AND sc.club_id = v_club_id)
  ORDER BY sc.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_team_shared_folders(p_team_id UUID)
RETURNS SETOF public.shared_content_folders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF NOT has_team_access(p_team_id) THEN RETURN; END IF;
  SELECT club_id INTO v_club_id FROM teams WHERE id = p_team_id;

  RETURN QUERY
  SELECT scf.*
  FROM shared_content_folders scf
  WHERE scf.team_id = p_team_id OR (scf.team_id IS NULL AND scf.club_id = v_club_id)
  ORDER BY scf.name;
END;
$$;

-- ── 8. Analytics : inclure le contenu club-wide vu par l'équipe ───────────────

CREATE OR REPLACE FUNCTION public.get_shared_content_analytics(p_team_id UUID)
RETURNS TABLE(
  content_id    UUID,
  content_title TEXT,
  content_type  TEXT,
  folder_name   TEXT,
  player_id     UUID,
  player_name   TEXT,
  viewed_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF NOT has_team_access(p_team_id) THEN RETURN; END IF;
  SELECT club_id INTO v_club_id FROM teams WHERE id = p_team_id;

  RETURN QUERY
  SELECT
    sc.id                                          AS content_id,
    sc.title::TEXT                                 AS content_title,
    sc.content_type::TEXT,
    scf.name::TEXT                                 AS folder_name,
    p.id                                           AS player_id,
    (p.first_name || ' ' || p.last_name)::TEXT     AS player_name,
    v.viewed_at
  FROM shared_content sc
  LEFT JOIN shared_content_views  v   ON v.content_id = sc.id
  LEFT JOIN players               p   ON p.id = v.player_id
  LEFT JOIN shared_content_folders scf ON scf.id = sc.folder_id
  WHERE sc.team_id = p_team_id OR (sc.team_id IS NULL AND sc.club_id = v_club_id)
  ORDER BY sc.created_at DESC, v.viewed_at DESC NULLS LAST;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION _shared_content_scope_set_club_id()      FROM PUBLIC;
REVOKE ALL ON FUNCTION _safe_uuid(TEXT)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_shared_content()                   FROM PUBLIC;
REVOKE ALL ON FUNCTION get_my_shared_folders()                   FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_shared_content(UUID)             FROM PUBLIC;
REVOKE ALL ON FUNCTION get_team_shared_folders(UUID)             FROM PUBLIC;
REVOKE ALL ON FUNCTION get_shared_content_analytics(UUID)        FROM PUBLIC;

GRANT EXECUTE ON FUNCTION _safe_uuid(TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_shared_content()                TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_shared_folders()                TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_shared_content(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION get_team_shared_folders(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION get_shared_content_analytics(UUID)     TO authenticated;
-- _shared_content_scope_set_club_id : trigger uniquement, aucun GRANT direct.

-- ── Vérification : aucune fonction ci-dessus exécutable par PUBLIC ────────────
DO $mig$
DECLARE
  v_leak TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      '_shared_content_scope_set_club_id', '_safe_uuid',
      'get_my_shared_content', 'get_my_shared_folders',
      'get_team_shared_content', 'get_team_shared_folders',
      'get_shared_content_analytics'
    )
    AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions shared_content encore exécutables par PUBLIC : %', v_leak;
  END IF;

  RAISE NOTICE 'OK : fonctions shared_content (club-wide + fichiers) verrouillées.';
END
$mig$;
