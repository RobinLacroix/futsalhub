-- Demande : les réponses au questionnaire wellness de MATCH (RPE, auto-éval,
-- forme, plaisir — cf. 20260827160000_match_feedback_questionnaire.sql) doivent
-- apparaître dans « Charge d'entraînement » au même titre que les entraînements :
-- vue équipe (graphique hebdo), vue par joueur (matrice), et onglet Joueur
-- individuel. Les 3 RPC de charge ne lisaient que `trainings` / `training_id` ;
-- elles lisent maintenant aussi les lignes `training_player_feedback` liées à
-- un `match_id`.
--
-- Un match n'a ni durée de séance ni RPE cible (`matches` n'a pas ces colonnes) :
-- `session_duration`/`target_rpe_min`/`target_rpe_max` valent NULL pour une
-- ligne de match. `sessionLoad()`/`weeklyTargetLoad()` (lib/trainingLoad.ts,
-- déjà en prod, aucun changement TS nécessaire) ignorent déjà proprement une
-- ligne sans durée : la charge de Foster (RPE × durée) et la bande de charge
-- visée restent donc TRAINING-ONLY, silencieusement — un match n'invente pas de
-- charge. Seules les 4 moyennes de wellness (rpe/auto-éval/forme/plaisir) et le
-- taux de réponse profitent des matchs, exactement le périmètre demandé.
--
-- La convocation à un match se lit sur `matches.players` (pas d'`attendance`
-- séparée comme pour un entraînement, cf. 20260827160000) : le calcul de
-- `convoked_count`/`convoked` en tient compte spécifiquement par branche.

-- ── 1. get_training_load : + branche match, même colonnes ────────────────────
CREATE OR REPLACE FUNCTION public.get_training_load(
  p_club_id   UUID,
  p_team_id   UUID DEFAULT NULL,
  p_from      DATE DEFAULT NULL,
  p_to        DATE DEFAULT NULL,
  p_positions TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  training_id UUID, session_date DATE, team_id UUID, theme TEXT,
  session_duration INTEGER, target_rpe_min SMALLINT, target_rpe_max SMALLINT,
  convoked_count INTEGER, response_count INTEGER,
  rpe_mean NUMERIC, auto_evaluation_mean NUMERIC, physical_form_mean NUMERIC, pleasure_mean NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    -- Entraînements (inchangé, cf. 20260827190000)
    SELECT
      t.id,
      (t.date AT TIME ZONE 'Europe/Paris')::date AS session_date,
      t.team_id,
      t.theme,
      t.session_duration,
      t.target_rpe_min,
      t.target_rpe_max,
      GREATEST(
        (SELECT COUNT(*)::int FROM jsonb_array_elements(COALESCE(NULLIF(t.convoked_players, 'null'::jsonb), '[]'::jsonb)) e
           JOIN public.players pl ON pl.id = (e->>'id')::uuid
           WHERE p_positions IS NULL OR pl.position = ANY(p_positions)),
        (SELECT COUNT(*)::int FROM jsonb_object_keys(COALESCE(t.attendance, '{}'::jsonb)) k
           JOIN public.players pl ON pl.id = k::uuid
           WHERE p_positions IS NULL OR pl.position = ANY(p_positions))
      ) AS convoked_count,
      COUNT(f.id) FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::integer AS response_count,
      ROUND(AVG(f.rpe)             FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2) AS rpe_mean,
      ROUND(AVG(f.auto_evaluation) FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2) AS auto_evaluation_mean,
      ROUND(AVG(f.physical_form)   FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2) AS physical_form_mean,
      ROUND(AVG(f.pleasure)        FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2) AS pleasure_mean
    FROM public.trainings t
    LEFT JOIN public.teams tm ON tm.id = t.team_id
    LEFT JOIN public.training_player_feedback f ON f.training_id = t.id
    LEFT JOIN public.players pf ON pf.id = f.player_id
    WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
      AND (p_team_id IS NULL OR t.team_id = p_team_id)
      AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
    GROUP BY t.id, t.date, t.team_id, t.theme, t.session_duration,
             t.target_rpe_min, t.target_rpe_max, t.convoked_players, t.attendance

    UNION ALL

    -- Matchs : ni durée ni RPE cible, wellness et taux de réponse uniquement.
    SELECT
      m.id,
      (m.date AT TIME ZONE 'Europe/Paris')::date,
      m.team_id,
      'Match' || COALESCE(' vs ' || m.opponent_team, ''),
      NULL::integer,
      NULL::smallint,
      NULL::smallint,
      (SELECT COUNT(*)::int FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) e
         JOIN public.players pl ON pl.id = (e->>'id')::uuid
         WHERE p_positions IS NULL OR pl.position = ANY(p_positions)),
      COUNT(fm.id) FILTER (WHERE p_positions IS NULL OR pfm.position = ANY(p_positions))::integer,
      ROUND(AVG(fm.rpe)             FILTER (WHERE p_positions IS NULL OR pfm.position = ANY(p_positions))::numeric, 2),
      ROUND(AVG(fm.auto_evaluation) FILTER (WHERE p_positions IS NULL OR pfm.position = ANY(p_positions))::numeric, 2),
      ROUND(AVG(fm.physical_form)   FILTER (WHERE p_positions IS NULL OR pfm.position = ANY(p_positions))::numeric, 2),
      ROUND(AVG(fm.pleasure)        FILTER (WHERE p_positions IS NULL OR pfm.position = ANY(p_positions))::numeric, 2)
    FROM public.matches m
    LEFT JOIN public.teams tmm ON tmm.id = m.team_id
    LEFT JOIN public.training_player_feedback fm ON fm.match_id = m.id
    LEFT JOIN public.players pfm ON pfm.id = fm.player_id
    WHERE tmm.club_id = p_club_id
      AND (p_team_id IS NULL OR m.team_id = p_team_id)
      AND (p_from IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
    GROUP BY m.id, m.date, m.team_id, m.opponent_team
  ) combined
  ORDER BY session_date;
END
$$;

REVOKE ALL ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) TO authenticated;

-- ── 2. get_player_training_load : + branche match ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_training_load(
  p_player_id UUID,
  p_from      DATE DEFAULT NULL,
  p_to        DATE DEFAULT NULL
)
RETURNS TABLE(
  training_id UUID, session_date DATE, team_id UUID, theme TEXT,
  session_duration INTEGER, target_rpe_min SMALLINT, target_rpe_max SMALLINT,
  convoked_count INTEGER, response_count INTEGER,
  rpe_mean NUMERIC, auto_evaluation_mean NUMERIC, physical_form_mean NUMERIC, pleasure_mean NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_player_health_access(p_player_id) THEN
    RAISE EXCEPTION 'Acces refuse au joueur %', p_player_id;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT
      t.id,
      (t.date AT TIME ZONE 'Europe/Paris')::date AS session_date,
      t.team_id,
      t.theme,
      t.session_duration,
      t.target_rpe_min,
      t.target_rpe_max,
      1,
      1,
      f.rpe::numeric,
      f.auto_evaluation::numeric,
      f.physical_form::numeric,
      f.pleasure::numeric
    FROM public.training_player_feedback f
    JOIN public.trainings t ON t.id = f.training_id
    WHERE f.player_id = p_player_id
      AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)

    UNION ALL

    SELECT
      m.id,
      (m.date AT TIME ZONE 'Europe/Paris')::date,
      m.team_id,
      'Match' || COALESCE(' vs ' || m.opponent_team, ''),
      NULL::integer,
      NULL::smallint,
      NULL::smallint,
      1,
      1,
      fm.rpe::numeric,
      fm.auto_evaluation::numeric,
      fm.physical_form::numeric,
      fm.pleasure::numeric
    FROM public.training_player_feedback fm
    JOIN public.matches m ON m.id = fm.match_id
    WHERE fm.player_id = p_player_id
      AND (p_from IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
  ) combined
  ORDER BY session_date;
END
$$;

REVOKE ALL ON FUNCTION public.get_player_training_load(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_training_load(UUID, DATE, DATE) TO authenticated;

-- ── 3. get_team_training_load_matrix : sessions training + match mêlées ──────
CREATE OR REPLACE FUNCTION public.get_team_training_load_matrix(
  p_club_id UUID,
  p_team_id UUID,
  p_limit   INTEGER DEFAULT 5,
  p_from    DATE DEFAULT NULL,
  p_to      DATE DEFAULT NULL
)
RETURNS TABLE(
  training_id UUID, session_date DATE, theme TEXT,
  session_duration INTEGER, target_rpe_min SMALLINT, target_rpe_max SMALLINT,
  player_id UUID, first_name TEXT, last_name TEXT, number INTEGER,
  convoked BOOLEAN, rpe SMALLINT, physical_form SMALLINT, pleasure SMALLINT, auto_evaluation SMALLINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  RETURN QUERY
  WITH last_sessions AS (
    SELECT * FROM (
      SELECT
        t.id,
        (t.date AT TIME ZONE 'Europe/Paris')::date AS session_date,
        t.theme,
        t.session_duration,
        t.target_rpe_min,
        t.target_rpe_max,
        'training'::text AS kind,
        t.attendance,
        t.convoked_players,
        NULL::jsonb AS match_players
      FROM public.trainings t
      LEFT JOIN public.teams tm ON tm.id = t.team_id
      WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
        AND t.team_id = p_team_id
        AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
        AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)

      UNION ALL

      SELECT
        m.id,
        (m.date AT TIME ZONE 'Europe/Paris')::date,
        'Match' || COALESCE(' vs ' || m.opponent_team, ''),
        NULL::integer,
        NULL::smallint,
        NULL::smallint,
        'match'::text,
        NULL::jsonb,
        NULL::jsonb,
        m.players
      FROM public.matches m
      LEFT JOIN public.teams tmm ON tmm.id = m.team_id
      WHERE tmm.club_id = p_club_id
        AND m.team_id = p_team_id
        AND (p_from IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
        AND (p_to   IS NULL OR (m.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
    ) sessions
    ORDER BY session_date DESC
    LIMIT GREATEST(p_limit, 0)
  ),
  roster AS (
    -- Même source que `getPlayersByTeam` : `player_teams`, pas `players.team_id`.
    SELECT DISTINCT p.id AS player_id, p.first_name, p.last_name, p.number
    FROM public.player_teams pt
    JOIN public.players p ON p.id = pt.player_id
    WHERE pt.team_id = p_team_id
      AND p.status IS DISTINCT FROM 'left'
  )
  SELECT
    s.id,
    s.session_date,
    s.theme,
    s.session_duration,
    s.target_rpe_min,
    s.target_rpe_max,
    r.player_id,
    r.first_name,
    r.last_name,
    r.number,
    (
      CASE WHEN s.kind = 'training' THEN
        (s.attendance ? r.player_id::text)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.convoked_players, '[]'::jsonb)) e
          WHERE e->>'id' = r.player_id::text
        )
      ELSE
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.match_players, '[]'::jsonb)) e
          WHERE e->>'id' = r.player_id::text
        )
      END
    ) AS convoked,
    f.rpe,
    f.physical_form,
    f.pleasure,
    f.auto_evaluation
  FROM last_sessions s
  CROSS JOIN roster r
  LEFT JOIN public.training_player_feedback f
    ON f.player_id = r.player_id
   AND ((s.kind = 'training' AND f.training_id = s.id) OR (s.kind = 'match' AND f.match_id = s.id))
  ORDER BY s.session_date, r.last_name, r.first_name;
END
$$;

REVOKE ALL ON FUNCTION public.get_team_training_load_matrix(UUID, UUID, INTEGER, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_training_load_matrix(UUID, UUID, INTEGER, DATE, DATE) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'get_training_load' LIMIT 1), 'EXECUTE')
     OR has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'get_player_training_load' LIMIT 1), 'EXECUTE')
     OR has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'get_team_training_load_matrix' LIMIT 1), 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Une des RPC de charge est exécutable par PUBLIC après cette migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_training_load' AND prosrc ILIKE '%FROM public.matches m%'
  ) THEN
    RAISE EXCEPTION 'get_training_load devrait inclure les matchs après cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_player_training_load' AND prosrc ILIKE '%JOIN public.matches m%'
  ) THEN
    RAISE EXCEPTION 'get_player_training_load devrait inclure les matchs après cette migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_team_training_load_matrix' AND prosrc ILIKE '%FROM public.matches m%'
  ) THEN
    RAISE EXCEPTION 'get_team_training_load_matrix devrait inclure les matchs après cette migration';
  END IF;
END;
$verify$;
