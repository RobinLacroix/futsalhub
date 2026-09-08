-- ─────────────────────────────────────────────────────────────────────────────
-- shared_content : policy UPDATE manquante.
--
-- shared_content_folders a une policy "scf_update" depuis 20260817100000, mais
-- shared_content (les ressources elles-mêmes : titre/description) n'en a
-- jamais eu — seuls SELECT/INSERT/DELETE existent. Résultat : un UPDATE
-- depuis le client (RLS activée, aucune policy = deny par défaut) ne touche
-- silencieusement aucune ligne. Nécessaire pour permettre au coach de corriger
-- le titre/description d'une ressource déjà publiée.
--
-- Même scope que "shared_content_delete" (créateur ou admin du club) combiné
-- au write-access team/club-wide déjà utilisé par "scf_update" : un coach ne
-- doit pouvoir modifier que le contenu de ses propres équipes (ou le sien),
-- un admin de club peut aussi modifier le contenu club-wide (team_id NULL).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shared_content_update" ON public.shared_content;
CREATE POLICY "shared_content_update" ON public.shared_content
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND has_team_write_access(team_id))
    OR (team_id IS NULL AND is_club_admin(club_id))
  );
