-- ─────────────────────────────────────────────────────────────────────────────
-- pain_reports : signalement de douleur par le joueur (body-map + intensité)
--   - 1 ligne par zone signalée, groupées par report_group (une soumission)
--   - source : 'questionnaire' (fin de séance) | 'spontane' (page joueur)
--   - intensity 1/2/3 = modérée / assez intense / très intense (1/2/3 clics)
--   - alerte staff via public.notifications (type 'pain_report'), 1 par soumission
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pain_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  report_group  UUID        NOT NULL,
  zone          TEXT        NOT NULL,
  side          TEXT        NOT NULL CHECK (side IN ('L','R','C')),
  intensity     SMALLINT    NOT NULL CHECK (intensity BETWEEN 1 AND 3),
  mode          TEXT        NOT NULL CHECK (mode IN ('zone','articulation')),
  source        TEXT        NOT NULL DEFAULT 'spontane' CHECK (source IN ('questionnaire','spontane')),
  note          TEXT,
  onset         TEXT        CHECK (onset IS NULL OR onset IN ('aigu','chronique')),
  training_id   UUID        REFERENCES trainings(id) ON DELETE SET NULL,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_reports_player_id    ON public.pain_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_pain_reports_reported_at  ON public.pain_reports(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_pain_reports_group        ON public.pain_reports(report_group);
CREATE INDEX IF NOT EXISTS idx_pain_reports_zone         ON public.pain_reports(zone);

COMMENT ON TABLE public.pain_reports IS 'Signalements de douleur par les joueurs (body-map zone/articulation + intensité 1-3)';

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.pain_reports ENABLE ROW LEVEL SECURITY;

-- Staff : accès complet aux joueurs de leurs équipes (réutilise has_player_access)
DROP POLICY IF EXISTS "Staff can view club pain_reports" ON public.pain_reports;
CREATE POLICY "Staff can view club pain_reports" ON public.pain_reports
  FOR SELECT USING (has_player_access(player_id));

DROP POLICY IF EXISTS "Staff can delete club pain_reports" ON public.pain_reports;
CREATE POLICY "Staff can delete club pain_reports" ON public.pain_reports
  FOR DELETE USING (has_player_access(player_id));

-- Joueur : peut voir ses propres signalements
DROP POLICY IF EXISTS "Player can view own pain_reports" ON public.pain_reports;
CREATE POLICY "Player can view own pain_reports" ON public.pain_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM players p WHERE p.id = pain_reports.player_id AND p.user_id = auth.uid())
  );

-- (Aucune policy INSERT : les écritures passent par les RPC SECURITY DEFINER ci-dessous)

-- ── Helper interne : notifier les coaches d'un joueur ─────────────────────────
-- Insère 1 notification 'pain_report' par coach (role != viewer) des équipes du joueur.
CREATE OR REPLACE FUNCTION _notify_pain_report(
  p_player_id  UUID,
  p_max_int    SMALLINT,
  p_zone_count INTEGER,
  p_first_zone TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pname TEXT;
  v_cuid  UUID;
  v_sev   TEXT;
  v_body  TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = p_player_id;

  v_sev := CASE p_max_int
             WHEN 3 THEN 'très intense'
             WHEN 2 THEN 'assez intense'
             ELSE 'modérée'
           END;

  v_body := COALESCE(v_pname, 'Un joueur')
            || ' signale une douleur ' || v_sev
            || CASE WHEN p_zone_count > 1
                    THEN ' sur ' || p_zone_count || ' zones (' || COALESCE(p_first_zone,'?') || '…)'
                    ELSE ' : ' || COALESCE(p_first_zone,'?')
               END;

  FOR v_cuid IN
    SELECT DISTINCT cm.user_id
    FROM player_teams pt
    JOIN teams t        ON t.id = pt.team_id
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE pt.player_id = p_player_id
      AND cm.role NOT IN ('viewer')
    UNION
    SELECT DISTINCT cm.user_id
    FROM players p2
    JOIN teams t2        ON t2.id = p2.team_id
    JOIN club_members cm ON cm.club_id = t2.club_id
    WHERE p2.id = p_player_id
      AND cm.role NOT IN ('viewer')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'pain_report',
      COALESCE(v_pname, 'Un joueur') || ' · Douleur signalée',
      v_body,
      jsonb_build_object('type','pain_report','player_id',p_player_id::text,'max_intensity',p_max_int)
    );
  END LOOP;
END;
$$;

-- ── Insertion interne partagée par les RPC publiques ──────────────────────────
CREATE OR REPLACE FUNCTION _insert_pain_reports(
  p_player_id   UUID,
  p_zones       JSONB,   -- [{ "zone": "...", "side": "L", "intensity": 2, "mode": "zone" }, ...]
  p_source      TEXT,
  p_note        TEXT,
  p_onset       TEXT,
  p_training_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group      UUID := gen_random_uuid();
  v_elem       JSONB;
  v_count      INTEGER := 0;
  v_max        SMALLINT := 0;
  v_first_zone TEXT;
  v_int        SMALLINT;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_zones');
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_int := LEAST(3, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id)
    VALUES (
      p_player_id, v_group,
      v_elem->>'zone',
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      p_source,
      NULLIF(trim(COALESCE(p_note,'')), ''),
      NULLIF(p_onset,''),
      p_training_id
    );

    v_count := v_count + 1;
    IF v_int > v_max THEN v_max := v_int; END IF;
    IF v_first_zone IS NULL THEN v_first_zone := v_elem->>'zone'; END IF;
  END LOOP;

  PERFORM _notify_pain_report(p_player_id, v_max, v_count, v_first_zone);

  RETURN jsonb_build_object('success', true, 'report_group', v_group, 'count', v_count);
END;
$$;

-- ── RPC 1 : joueur authentifié (page joueur, spontané ou fin de séance) ───────
CREATE OR REPLACE FUNCTION report_my_pain(
  p_zones       JSONB,
  p_note        TEXT DEFAULT NULL,
  p_onset       TEXT DEFAULT NULL,
  p_training_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_source    TEXT;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;

  v_source := CASE WHEN p_training_id IS NULL THEN 'spontane' ELSE 'questionnaire' END;
  RETURN _insert_pain_reports(v_player_id, p_zones, v_source, p_note, p_onset, p_training_id);
END;
$$;

-- ── RPC 2 : via token de questionnaire (lien anonyme, non connecté) ───────────
CREATE OR REPLACE FUNCTION report_pain_by_token(
  p_token TEXT,
  p_zones JSONB,
  p_note  TEXT DEFAULT NULL,
  p_onset TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id   UUID;
  v_training_id UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  SELECT tft.player_id, tft.training_id, tft.expires_at
    INTO v_player_id, v_training_id, v_expires_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  RETURN _insert_pain_reports(v_player_id, p_zones, 'questionnaire', p_note, p_onset, v_training_id);
END;
$$;

-- ── RPC 3 : staff, historique groupé par soumission ───────────────────────────
CREATE OR REPLACE FUNCTION get_player_pain_reports(p_player_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(g ORDER BY g.reported_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      pr.report_group,
      MIN(pr.reported_at)                      AS reported_at,
      MAX(pr.source)                           AS source,
      MAX(pr.intensity)                        AS max_intensity,
      MAX(pr.note)                             AS note,
      MAX(pr.onset)                            AS onset,
      MAX(pr.training_id::text)                AS training_id,
      jsonb_agg(
        jsonb_build_object('zone', pr.zone, 'side', pr.side, 'intensity', pr.intensity, 'mode', pr.mode)
        ORDER BY pr.intensity DESC
      )                                        AS zones
    FROM public.pain_reports pr
    WHERE pr.player_id = p_player_id
      AND has_player_access(p_player_id)
    GROUP BY pr.report_group
  ) g;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION report_my_pain(JSONB, TEXT, TEXT, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION report_pain_by_token(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_player_pain_reports(UUID)             TO authenticated;

-- ── Compteur de notifications : ajouter la clé 'pain_report' ──────────────────
CREATE OR REPLACE FUNCTION get_my_notification_counts()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'convocation',      COUNT(*) FILTER (WHERE type = 'convocation'),
    'questionnaire',    COUNT(*) FILTER (WHERE type = 'questionnaire'),
    'absence_report',   COUNT(*) FILTER (WHERE type = 'absence_report'),
    'feedback_comment', COUNT(*) FILTER (WHERE type = 'feedback_comment'),
    'pain_report',      COUNT(*) FILTER (WHERE type = 'pain_report'),
    'total',            COUNT(*)
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
