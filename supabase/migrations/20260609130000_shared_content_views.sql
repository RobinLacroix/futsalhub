-- Tracking des ouvertures de contenu partagé par les joueurs.
-- Permet au coach de monitorer qui a ouvert quoi et quand.

CREATE TABLE IF NOT EXISTS public.shared_content_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID        NOT NULL REFERENCES public.shared_content(id)  ON DELETE CASCADE,
  player_id  UUID        NOT NULL REFERENCES public.players(id)         ON DELETE CASCADE,
  team_id    UUID                    REFERENCES public.teams(id)         ON DELETE SET NULL,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scv_content   ON public.shared_content_views(content_id);
CREATE INDEX IF NOT EXISTS idx_scv_player    ON public.shared_content_views(player_id);
CREATE INDEX IF NOT EXISTS idx_scv_team      ON public.shared_content_views(team_id);
CREATE INDEX IF NOT EXISTS idx_scv_viewed_at ON public.shared_content_views(viewed_at DESC);

ALTER TABLE public.shared_content_views ENABLE ROW LEVEL SECURITY;

-- Les coaches peuvent lire les vues de leur club
CREATE POLICY "Coaches can read content views"
  ON public.shared_content_views
  FOR SELECT
  USING (has_club_access(auth.uid()));

-- ─── RPC joueur : enregistrer une ouverture (SECURITY DEFINER) ────────────────

CREATE OR REPLACE FUNCTION public.log_shared_content_view(p_content_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_team_id   UUID;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN RETURN; END IF;

  -- Déduplication : ne pas logguer si déjà loggué dans les 5 dernières minutes
  IF EXISTS (
    SELECT 1 FROM shared_content_views
    WHERE content_id = p_content_id
      AND player_id  = v_player_id
      AND viewed_at  > now() - INTERVAL '5 minutes'
  ) THEN RETURN; END IF;

  SELECT team_id INTO v_team_id
  FROM shared_content
  WHERE id = p_content_id
  LIMIT 1;

  INSERT INTO shared_content_views(content_id, player_id, team_id)
  VALUES (p_content_id, v_player_id, v_team_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_shared_content_view(UUID) TO authenticated;

-- ─── RPC coach : récupérer les analytiques d'une équipe ──────────────────────

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
BEGIN
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
  WHERE sc.team_id = p_team_id
  ORDER BY sc.created_at DESC, v.viewed_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_content_analytics(UUID) TO authenticated;
