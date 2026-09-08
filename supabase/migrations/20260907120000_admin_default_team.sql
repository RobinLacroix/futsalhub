-- Équipe par défaut à l'atterrissage, réglable par l'admin dans les paramètres.
-- Demande Robin (2026-09-07) : un admin qui gère plusieurs équipes du club
-- retombe aujourd'hui sur la première équipe (alphabétique côté web, "première
-- équipe encadrée" côté mobile — cf. ActiveTeamContext des deux plateformes) à
-- chaque ouverture, sans pouvoir choisir laquelle.
--
-- Scope ADMIN uniquement, même principe que notification_team_preferences
-- (20260822140000) : un coach n'a de toute façon déjà que ses équipes assignées,
-- l'ambiguïté du "sur laquelle j'atterris" ne se pose que pour l'admin qui voit
-- tout le club.
CREATE TABLE IF NOT EXISTS public.admin_default_team (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_default_team IS
  'Équipe de landing par défaut, réglable par un admin de club. Absence de ligne = comportement automatique existant (alphabétique web / première équipe encadrée mobile).';

ALTER TABLE public.admin_default_team ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own admin default team" ON public.admin_default_team;
CREATE POLICY "read own admin default team" ON public.admin_default_team
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "write own admin default team" ON public.admin_default_team;
CREATE POLICY "write own admin default team" ON public.admin_default_team
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── RPC ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_default_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM admin_default_team WHERE user_id = auth.uid();
$$;

-- p_team_id NULL = efface le réglage (retour au comportement automatique).
CREATE OR REPLACE FUNCTION set_my_default_team_id(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_team_id IS NULL THEN
    DELETE FROM admin_default_team WHERE user_id = auth.uid();
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM club_members cm
    JOIN teams t ON t.club_id = cm.club_id
    WHERE cm.user_id = auth.uid() AND cm.role = 'admin' AND t.id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé: réservé aux admins du club de cette équipe';
  END IF;

  INSERT INTO admin_default_team (user_id, team_id, updated_at)
  VALUES (auth.uid(), p_team_id, NOW())
  ON CONFLICT (user_id) DO UPDATE SET team_id = EXCLUDED.team_id, updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION get_my_default_team_id()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_my_default_team_id(UUID)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_default_team_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION set_my_default_team_id(UUID) TO authenticated;

-- ── Vérification ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname IN ('get_my_default_team_id', 'set_my_default_team_id')
      AND (
        p.proacl IS NULL
        OR EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) a
          LEFT JOIN pg_roles gr ON gr.oid = a.grantee
          WHERE a.privilege_type = 'EXECUTE'
            AND (a.grantee = 0 OR gr.rolname = 'anon')
        )
      )
  ) THEN
    RAISE EXCEPTION 'admin_default_team RPC : joignable par PUBLIC ou anon — le REVOKE ci-dessus n''a pas tenu';
  END IF;
END $$;
