-- Table des dossiers de la bibliothèque d'équipe
CREATE TABLE public.shared_content_folders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  parent_id   uuid        REFERENCES public.shared_content_folders(id) ON DELETE CASCADE,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scf_team     ON public.shared_content_folders(team_id);
CREATE INDEX idx_scf_parent   ON public.shared_content_folders(parent_id);

-- Lien dossier sur les contenus existants (null = racine)
ALTER TABLE public.shared_content
  ADD COLUMN folder_id uuid REFERENCES public.shared_content_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_sc_folder ON public.shared_content(folder_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.shared_content_folders ENABLE ROW LEVEL SECURITY;

-- SELECT : coachs/admins ET joueurs de l'équipe
CREATE POLICY "scf_select" ON public.shared_content_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.club_members cm ON cm.club_id = t.club_id
      WHERE t.id = shared_content_folders.team_id AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.player_teams pt
      JOIN public.players p ON p.id = pt.player_id
      WHERE pt.team_id = shared_content_folders.team_id AND p.user_id = auth.uid()
    )
  );

-- INSERT : coachs/admins uniquement
CREATE POLICY "scf_insert" ON public.shared_content_folders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.club_members cm ON cm.club_id = t.club_id
      WHERE t.id = shared_content_folders.team_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'coach')
    )
  );

-- UPDATE : coachs/admins uniquement
CREATE POLICY "scf_update" ON public.shared_content_folders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.club_members cm ON cm.club_id = t.club_id
      WHERE t.id = shared_content_folders.team_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'coach')
    )
  );

-- DELETE : créateur OU admin
CREATE POLICY "scf_delete" ON public.shared_content_folders
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.club_members cm ON cm.club_id = t.club_id
      WHERE t.id = shared_content_folders.team_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );
