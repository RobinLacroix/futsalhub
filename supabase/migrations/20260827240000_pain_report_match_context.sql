-- Deux demandes liées à la déclaration de douleur en fin de MATCH :
--
-- 1. « Fin de séance » s'affiche partout dans Infirmerie même quand la
--    déclaration vient d'un questionnaire de match. Cause : `pain_reports` n'a
--    qu'une colonne `training_id`, jamais renseignée pour un match — et
--    `report_pain_by_token` ne lisait que `tft.training_id` sur le token, pas
--    `tft.match_id` (colonne ajoutée le même jour par
--    20260827160000_match_feedback_questionnaire.sql, jamais branchée ici).
--    Bonus découvert en le corrigeant : le rate-limit de cette RPC
--    (`training_id = v_training_id`) ne mordait jamais sur un match, puisque
--    comparer à NULL ne matche jamais rien — un joueur pouvait re-soumettre le
--    questionnaire douleur de match sans limite.
--
-- 2. Plus aucune notification staff n'arrive à la déclaration d'une douleur.
--    Régression introduite par MOI-MÊME dans 20260827150000_pain_scale_1_to_10 :
--    en réécrivant `_insert_pain_reports` pour l'échelle 1-10, le
--    `PERFORM _notify_pain_report(...)` de la version d'origine (20260729120000)
--    a été perdu à la réécriture. Seul le chemin d'ÉDITION
--    (`update_my_pain_report`) notifiait encore. Restauré ici, et étendu pour
--    dire « fin de match » / « fin de séance » dans le corps du message —
--    cohérent avec le point 1.
--
-- Fix : `pain_reports` gagne `match_id` (miroir de `training_id`, même
-- exclusion mutuelle que `player_events` — cf. 20260827230000). Toute la
-- chaîne d'écriture (`report_pain_by_token`, `_insert_pain_reports`,
-- `update_my_pain_report`, `_notify_pain_report`) et de lecture
-- (`get_player_pain_reports`, `get_club_pain_reports`) le propage.
--
-- `_insert_pain_reports` et `_notify_pain_report` gagnent un paramètre en fin
-- de liste (avec DEFAULT) : ce sont des helpers internes (préfixe `_`, jamais
-- appelés hors d'autres fonctions SECURITY DEFINER de ce module), donc ça crée
-- une signature de plus à côté des anciennes — comme pour get_training_load
-- (20260827190000). Les anciennes signatures restent verrouillées PUBLIC tel
-- quel (20260803100000 / 20260827180000) et deviennent orphelines : personne
-- ne les appelle plus après cette migration, rien à en faire de plus.
--
-- Trouvé au passage en touchant `update_my_pain_report` : son clamp
-- d'intensité était resté à `LEAST(3, ...)`, jamais mis à jour par la
-- migration 1-10 (qui n'avait touché que `_insert_pain_reports`) — modifier
-- une déclaration à 8/10 la ramenait silencieusement à 3/10. Corrigé au
-- passage (`LEAST(10, ...)`, même borne que la création). Et ses grants
-- portaient `anon` en plus d'`authenticated` (jamais écrit ainsi dans
-- 20260823150000, sans risque réel puisque `auth.uid()` est NULL pour un
-- appel anon donc la fonction sort proprement sur `no_player` — mais pas
-- l'intention documentée) : réaligné sur `authenticated` seul.

-- ── pain_reports : + match_id ──────────────────────────────────────────────────
ALTER TABLE public.pain_reports
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pain_reports_training_or_match_check'
  ) THEN
    ALTER TABLE public.pain_reports
      ADD CONSTRAINT pain_reports_training_or_match_check
      CHECK (training_id IS NULL OR match_id IS NULL);
  END IF;
END;
$$;

-- ── _notify_pain_report : + contexte match/séance, unifie création+édition ────
CREATE OR REPLACE FUNCTION public._notify_pain_report(
  p_player_id   UUID,
  p_max_int     SMALLINT,
  p_zone_count  INTEGER,
  p_first_zone  TEXT,
  p_edited      BOOLEAN DEFAULT FALSE,
  p_training_id UUID DEFAULT NULL,
  p_match_id    UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pname   TEXT;
  v_cuid    UUID;
  v_sev     TEXT;
  v_verb    TEXT;
  v_context TEXT;
  v_body    TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_pname FROM players WHERE id = p_player_id;

  v_sev := CASE
             WHEN p_max_int >= 9 THEN 'très intense'
             WHEN p_max_int >= 7 THEN 'intense'
             WHEN p_max_int >= 4 THEN 'modérée'
             ELSE 'légère'
           END || ' (' || p_max_int || '/10)';

  v_verb := CASE WHEN p_edited THEN 'a mis à jour sa déclaration : douleur' ELSE 'signale une douleur' END;

  v_context := CASE
                 WHEN p_match_id IS NOT NULL THEN ' (fin de match)'
                 WHEN p_training_id IS NOT NULL THEN ' (fin de séance)'
                 ELSE ''
               END;

  v_body := COALESCE(v_pname, 'Un joueur')
            || ' ' || v_verb || ' ' || v_sev
            || CASE WHEN p_zone_count > 1
                    THEN ' sur ' || p_zone_count || ' zones (' || COALESCE(p_first_zone,'?') || '…)'
                    ELSE ' : ' || COALESCE(p_first_zone,'?')
               END
            || v_context;

  -- Reprend le pattern le plus correct des deux anciennes signatures :
  -- _notif_team_enabled (préférences par équipe) + GROUP BY (dédup), que seule
  -- la version « création » (20260827100000/150000) avait.
  FOR v_cuid IN
    SELECT cm.user_id
    FROM players p
    LEFT JOIN player_teams pt ON pt.player_id = p.id
    JOIN teams t ON t.id = COALESCE(pt.team_id, p.team_id)
    JOIN club_members cm ON cm.club_id = t.club_id
    WHERE p.id = p_player_id
      AND cm.role IN ('admin','coach')
      AND (cm.role = 'admin' OR cm.team_id = t.id)
      AND _notif_team_enabled(cm.user_id, t.id)
    GROUP BY cm.user_id
  LOOP
    CONTINUE WHEN NOT _notif_enabled(v_cuid, 'pain_report');
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_cuid, 'pain_report',
      COALESCE(v_pname, 'Un joueur') || ' · ' || CASE WHEN p_edited THEN 'Déclaration modifiée' ELSE 'Douleur signalée' END,
      v_body,
      jsonb_build_object(
        'type', 'pain_report', 'player_id', p_player_id::text, 'max_intensity', p_max_int, 'edited', p_edited,
        'training_id', p_training_id::text, 'match_id', p_match_id::text
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._notify_pain_report(UUID, SMALLINT, INTEGER, TEXT, BOOLEAN, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- ── _insert_pain_reports : + match_id, notification restaurée ─────────────────
CREATE OR REPLACE FUNCTION public._insert_pain_reports(
  p_player_id   UUID,
  p_zones       JSONB,
  p_source      TEXT,
  p_note        TEXT,
  p_onset       TEXT,
  p_training_id UUID,
  p_match_id    UUID DEFAULT NULL
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
    v_int := LEAST(10, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id, match_id)
    VALUES (
      p_player_id, v_group,
      v_elem->>'zone',
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      p_source, p_note, p_onset, p_training_id, p_match_id
    );

    v_count := v_count + 1;
    v_max := GREATEST(v_max, v_int);
    IF v_first_zone IS NULL THEN v_first_zone := v_elem->>'zone'; END IF;
  END LOOP;

  PERFORM _notify_pain_report(p_player_id, v_max, v_count, v_first_zone, FALSE, p_training_id, p_match_id);

  RETURN jsonb_build_object(
    'success', true, 'report_group', v_group,
    'zone_count', v_count, 'max_intensity', v_max, 'first_zone', v_first_zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public._insert_pain_reports(UUID, JSONB, TEXT, TEXT, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- ── report_my_pain : appelle la nouvelle signature (match_id toujours NULL,
--    aucun appelant actuel ne fournit de contexte match) ─────────────────────
CREATE OR REPLACE FUNCTION public.report_my_pain(
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
  RETURN _insert_pain_reports(v_player_id, p_zones, v_source, p_note, p_onset, p_training_id, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.report_my_pain(JSONB, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_my_pain(JSONB, TEXT, TEXT, UUID) TO authenticated;

-- ── report_pain_by_token : lit match_id sur le token, rate-limit corrigé ──────
CREATE OR REPLACE FUNCTION public.report_pain_by_token(
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
  v_match_id    UUID;
  v_expires_at  TIMESTAMPTZ;
  v_groups      INTEGER;
BEGIN
  SELECT tft.player_id, tft.training_id, tft.match_id, tft.expires_at
    INTO v_player_id, v_training_id, v_match_id, v_expires_at
  FROM training_feedback_tokens tft
  WHERE tft.token = p_token;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  SELECT COUNT(DISTINCT report_group) INTO v_groups
  FROM public.pain_reports
  WHERE player_id = v_player_id
    AND (
      (v_training_id IS NOT NULL AND training_id = v_training_id)
      OR (v_match_id IS NOT NULL AND match_id = v_match_id)
    );

  IF v_groups >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
  END IF;

  RETURN _insert_pain_reports(v_player_id, p_zones, 'questionnaire', p_note, p_onset, v_training_id, v_match_id);
END;
$$;

REVOKE ALL ON FUNCTION public.report_pain_by_token(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_pain_by_token(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

-- ── update_my_pain_report : + match_id, clamp 1-10, grants réalignés ─────────
CREATE OR REPLACE FUNCTION public.update_my_pain_report(
  p_report_group UUID,
  p_zones        JSONB,
  p_note         TEXT DEFAULT NULL,
  p_onset        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id   UUID;
  v_source      TEXT;
  v_training_id UUID;
  v_match_id    UUID;
  v_reported_at TIMESTAMPTZ;
  v_elem        JSONB;
  v_count       INTEGER := 0;
  v_max         SMALLINT := 0;
  v_first_zone  TEXT;
  v_int         SMALLINT;
  v_zone        TEXT;
BEGIN
  SELECT id INTO v_player_id FROM players WHERE user_id = auth.uid() LIMIT 1;
  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_player');
  END IF;

  SELECT MAX(source), MAX(training_id::text)::UUID, MAX(match_id::text)::UUID, MIN(reported_at)
  INTO v_source, v_training_id, v_match_id, v_reported_at
  FROM public.pain_reports
  WHERE report_group = p_report_group AND player_id = v_player_id;

  IF v_reported_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_zones');
  END IF;
  IF jsonb_array_length(p_zones) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_zones');
  END IF;
  IF p_onset IS NOT NULL AND p_onset NOT IN ('aigu','chronique') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_onset');
  END IF;

  -- Passe de validation seule (aucune écriture) : une entrée invalide ne doit
  -- jamais effacer la déclaration existante.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_zone := left(COALESCE(v_elem->>'zone', ''), 40);
    IF v_zone !~ '^[A-Za-z0-9_-]{1,40}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_zone');
    END IF;
  END LOOP;

  DELETE FROM public.pain_reports
  WHERE report_group = p_report_group AND player_id = v_player_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_zones)
  LOOP
    v_int  := LEAST(10, GREATEST(1, COALESCE((v_elem->>'intensity')::SMALLINT, 1)));
    v_zone := left(COALESCE(v_elem->>'zone', ''), 40);

    INSERT INTO public.pain_reports
      (player_id, report_group, zone, side, intensity, mode, source, note, onset, training_id, match_id, reported_at)
    VALUES (
      v_player_id, p_report_group,
      v_zone,
      COALESCE(NULLIF(v_elem->>'side',''), 'C'),
      v_int,
      COALESCE(NULLIF(v_elem->>'mode',''), 'zone'),
      v_source,
      NULLIF(left(trim(COALESCE(p_note,'')), 500), ''),
      NULLIF(p_onset,''),
      v_training_id,
      v_match_id,
      v_reported_at
    );

    v_count := v_count + 1;
    IF v_int > v_max THEN v_max := v_int; END IF;
    IF v_first_zone IS NULL THEN v_first_zone := v_zone; END IF;
  END LOOP;

  PERFORM _notify_pain_report(v_player_id, v_max, v_count, v_first_zone, true, v_training_id, v_match_id);

  RETURN jsonb_build_object('success', true, 'report_group', p_report_group, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_pain_report(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_pain_report(UUID, JSONB, TEXT, TEXT) TO authenticated;

-- ── get_player_pain_reports : + match_id ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_pain_reports(p_player_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(g ORDER BY g.reported_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      pr.report_group,
      MIN(pr.reported_at)        AS reported_at,
      MAX(pr.source)             AS source,
      MAX(pr.intensity)          AS max_intensity,
      MAX(pr.note)               AS note,
      MAX(pr.onset)              AS onset,
      MAX(pr.training_id::text)  AS training_id,
      MAX(pr.match_id::text)     AS match_id,
      jsonb_agg(
        jsonb_build_object('zone', pr.zone, 'side', pr.side, 'intensity', pr.intensity, 'mode', pr.mode)
        ORDER BY pr.intensity DESC
      )                          AS zones
    FROM public.pain_reports pr
    WHERE pr.player_id = p_player_id
      AND (
        has_player_access(p_player_id)
        OR EXISTS (SELECT 1 FROM players p WHERE p.id = p_player_id AND p.user_id = auth.uid())
      )
    GROUP BY pr.report_group
  ) g;
$$;

REVOKE ALL ON FUNCTION public.get_player_pain_reports(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_pain_reports(UUID) TO authenticated;

-- ── get_club_pain_reports : + match_id ────────────────────────────────────────
-- `match_id` s'insère avant `zones` dans la liste des colonnes retournées : ça
-- change la forme du type ligne (OUT params), ce que CREATE OR REPLACE refuse
-- (contrairement à un simple ajout en fin de liste). DROP d'abord, comme pour
-- toute RETURNS TABLE dont l'ensemble de colonnes change de forme.
DROP FUNCTION IF EXISTS public.get_club_pain_reports(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_club_pain_reports(
  p_club_id UUID,
  p_team_id UUID DEFAULT NULL,
  p_limit   INTEGER DEFAULT 30
)
RETURNS TABLE(
  report_group UUID, player_id UUID, first_name TEXT, last_name TEXT, number INTEGER,
  reported_at TIMESTAMPTZ, source TEXT, max_intensity SMALLINT, note TEXT, onset TEXT,
  training_id UUID, match_id UUID, zones JSONB
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'Limite invalide : %', p_limit;
  END IF;

  RETURN QUERY
  SELECT g.report_group, g.player_id, g.first_name, g.last_name, g.number,
         g.reported_at, g.source, g.max_intensity, g.note, g.onset,
         g.training_id, g.match_id, g.zones
  FROM (
    SELECT
      pr.report_group,
      p.id                            AS player_id,
      p.first_name,
      p.last_name,
      p.number,
      MIN(pr.reported_at)             AS reported_at,
      MAX(pr.source)                  AS source,
      MAX(pr.intensity)               AS max_intensity,
      MAX(pr.note)                    AS note,
      MAX(pr.onset)                   AS onset,
      MAX(pr.training_id::text)::uuid AS training_id,
      MAX(pr.match_id::text)::uuid    AS match_id,
      jsonb_agg(
        jsonb_build_object('zone', pr.zone, 'side', pr.side, 'intensity', pr.intensity, 'mode', pr.mode)
        ORDER BY pr.intensity DESC
      )                               AS zones
    FROM public.pain_reports pr
    JOIN public.players p ON p.id = pr.player_id
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE COALESCE(p.club_id, t.club_id) = p_club_id
      AND (p_team_id IS NULL OR p.team_id = p_team_id)
    GROUP BY pr.report_group, p.id, p.first_name, p.last_name, p.number
  ) g
  ORDER BY g.reported_at DESC
  LIMIT p_limit;
END
$$;

REVOKE ALL ON FUNCTION public.get_club_pain_reports(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_pain_reports(UUID, UUID, INTEGER) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_leak TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pain_reports' AND column_name = 'match_id'
  ) THEN
    RAISE EXCEPTION 'pain_reports.match_id aurait dû être créée par cette migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = '_insert_pain_reports' AND prosrc ILIKE '%PERFORM _notify_pain_report%'
  ) THEN
    RAISE EXCEPTION '_insert_pain_reports devrait notifier le staff après cette migration (régression du 20260827150000)';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_leak
  FROM pg_proc p
  WHERE p.proname IN (
    'report_my_pain','report_pain_by_token','update_my_pain_report',
    'get_player_pain_reports','get_club_pain_reports'
  )
  AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions douleur encore exécutables par PUBLIC : %', v_leak;
  END IF;

  IF has_function_privilege('anon', (SELECT oid FROM pg_proc WHERE proname = 'update_my_pain_report'), 'EXECUTE') THEN
    RAISE EXCEPTION 'update_my_pain_report ne devrait plus être exécutable par anon après réalignement';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname IN ('_insert_pain_reports', '_notify_pain_report')
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Un helper interne douleur est exécutable par PUBLIC après cette migration';
  END IF;
END;
$verify$;
