-- ═════════════════════════════════════════════════════════════════════════════
-- Fix : 2 régressions issues du rollout "club-wide files" du 2026-08-17
-- (20260817100000_shared_content_club_wide_files.sql), signalées par Robin :
--
--   1. Un joueur qui clique "Ouvrir" sur une ressource partagée (ex. un .mp4)
--      n'obtient rien, sans message d'erreur.
--
--   2. Une vidéo partagée en fichier n'ajoute jamais de vue dans les
--      statistiques de suivi d'ouverture.
--
-- Ce ne sont pas des bugs applicatifs : la base réelle diverge des fichiers
-- de migration (cf. CLAUDE.md, "supabase/migrations n'est PAS une source de
-- vérité fiable"). Vérifié via pg_get_functiondef/pg_policies sur le projet,
-- pas seulement par lecture du repo.
--
-- ── Cause n°1 (storage RLS, bug n°1) ──────────────────────────────────────────
-- La policy SELECT `shared_content_files_select` sur storage.objects écrit,
-- dans sa branche joueur :
--
--   EXISTS (
--     SELECT 1 FROM player_teams pt JOIN players p ON ... JOIN teams t ON ...
--     WHERE p.user_id = auth.uid()
--       AND t.club_id = _safe_uuid((storage.foldername(name))[1])
--       AND (...= _safe_uuid((storage.foldername(name))[2]))
--   )
--
-- `name` y est censé désigner `storage.objects.name` (le chemin du fichier,
-- ex. "{club_id}/{team_id|club}/{fichier}"). Mais la sous-requête FROM
-- contient aussi `teams t`, qui a elle-même une colonne `name` (le nom de
-- l'équipe, ex. "U18") : en SQL, une colonne non qualifiée se résout sur la
-- table la plus proche dans son propre FROM, donc `name` se lie ici à
-- `t.name`, pas à l'objet du bucket. C'est confirmé par `pg_policies` sur la
-- base réelle, qui affiche explicitement `storage.foldername((t.name)::text)`
-- — alors que le fichier de migration écrit bien `storage.foldername(name)`
-- sans qualification. Résultat : `(storage.foldername(t.name))[1]` tente de
-- caster un nom d'équipe en UUID, échoue systématiquement (`_safe_uuid`
-- renvoie NULL), et la branche joueur de la policy est donc TOUJOURS fausse.
-- Un joueur ne peut lire (donc générer une URL signée pour) AUCUN fichier
-- partagé, quel que soit le type ou le mode de partage — sauf s'il est aussi
-- membre de club_members (staff). Fix : qualifier explicitement `objects.name`.
--
-- ── Cause n°2 (log_shared_content_view, bug n°2) ──────────────────────────────
-- `log_shared_content_view` porte encore le corps du 2026-08-03
-- (20260803100000, §8 : correctif anti-fuite inter-club), écrit à une époque
-- où `shared_content.team_id` était NOT NULL. Il contient :
--
--   SELECT team_id INTO v_team_id FROM shared_content WHERE id = p_content_id;
--   IF v_team_id IS NULL THEN RETURN; END IF;
--
-- Depuis le 2026-08-17, `team_id IS NULL` signifie "partagé à toutes les
-- équipes du club" (nouveau cas légitime), pas "contenu introuvable". Cette
-- fonction n'a jamais été mise à jour pour ce nouveau cas : elle sort en
-- silence sans jamais insérer de ligne dès qu'un contenu est partagé au
-- niveau du club — ce qui est très probablement le mode de partage de la
-- vidéo en question. Fix : reprendre le même pattern club-wide que
-- get_my_shared_content (team_id direct OU club_id via player_teams).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Storage RLS : qualifier objects.name (au lieu du name ambigu) ─────────

DROP POLICY IF EXISTS "shared_content_files_select" ON storage.objects;
CREATE POLICY "shared_content_files_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'shared-content'
    AND (
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.user_id = auth.uid() AND cm.club_id = _safe_uuid((storage.foldername(objects.name))[1])
      )
      OR EXISTS (
        SELECT 1 FROM player_teams pt
        JOIN players p ON p.id = pt.player_id
        JOIN teams t  ON t.id = pt.team_id
        WHERE p.user_id = auth.uid()
          AND t.club_id = _safe_uuid((storage.foldername(objects.name))[1])
          AND ((storage.foldername(objects.name))[2] = 'club' OR pt.team_id = _safe_uuid((storage.foldername(objects.name))[2]))
      )
    )
  );

-- ── 2. log_shared_content_view : gérer le partage club-wide (team_id NULL) ───

CREATE OR REPLACE FUNCTION public.log_shared_content_view(p_content_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_content_team_id UUID;
  v_content_club_id UUID;
  v_log_team_id UUID;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN RETURN; END IF;

  SELECT team_id, club_id INTO v_content_team_id, v_content_club_id
  FROM shared_content WHERE id = p_content_id LIMIT 1;
  IF v_content_club_id IS NULL THEN RETURN; END IF;

  IF v_content_team_id IS NOT NULL THEN
    -- Contenu team-scopé : le joueur doit appartenir à cette équipe précise.
    IF NOT EXISTS (
      SELECT 1 FROM players p WHERE p.id = v_player_id AND p.team_id = v_content_team_id
      UNION ALL
      SELECT 1 FROM player_teams pt WHERE pt.player_id = v_player_id AND pt.team_id = v_content_team_id
    ) THEN
      RETURN;
    END IF;
    v_log_team_id := v_content_team_id;
  ELSE
    -- Contenu club-wide : le joueur doit appartenir à une équipe de ce club
    -- (même pattern que get_my_shared_content, 20260817100000 §6).
    SELECT pt.team_id INTO v_log_team_id
    FROM player_teams pt
    JOIN teams t ON t.id = pt.team_id
    WHERE pt.player_id = v_player_id AND t.club_id = v_content_club_id
    LIMIT 1;

    IF v_log_team_id IS NULL THEN
      SELECT p.team_id INTO v_log_team_id
      FROM players p
      JOIN teams t ON t.id = p.team_id
      WHERE p.id = v_player_id AND t.club_id = v_content_club_id
      LIMIT 1;
    END IF;

    IF v_log_team_id IS NULL THEN RETURN; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM shared_content_views
    WHERE content_id = p_content_id
      AND player_id  = v_player_id
      AND viewed_at  > now() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  INSERT INTO shared_content_views(content_id, player_id, team_id)
  VALUES (p_content_id, v_player_id, v_log_team_id);
END;
$$;

REVOKE ALL   ON FUNCTION public.log_shared_content_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_shared_content_view(UUID) TO authenticated;

-- ── 3. Vérification ────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_qual TEXT;
BEGIN
  SELECT qual::text INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'shared_content_files_select';

  IF v_qual IS NULL OR v_qual ILIKE '%(t.name)%' THEN
    RAISE EXCEPTION 'shared_content_files_select toujours ambigu apres correction : %', v_qual;
  END IF;
END
$mig$;

COMMIT;
