-- Fix de 20260827200000_training_load_include_matches.sql : la branche match de
-- get_training_load référence `m.players` (sous-requête de comptage des
-- convoqués) hors agrégat, sans l'avoir ajoutée au GROUP BY — contrairement à
-- la branche entraînement qui ajoute bien `t.convoked_players, t.attendance`
-- pour la même raison. Résultat en base : `column "m.players" must appear in
-- the GROUP BY clause or be used in an aggregate function`, qui fait échouer
-- toute la fonction (entraînements compris) — d'où « chargement impossible »
-- et plus aucune donnée dans Charge d'entraînement.
--
-- Seule la clause GROUP BY change. Signature, colonnes retournées, garde
-- d'accès et grants identiques à 20260827200000.

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
    -- Entraînements (inchangé)
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
    GROUP BY m.id, m.date, m.team_id, m.opponent_team, m.players
  ) combined
  ORDER BY session_date;
END
$$;

REVOKE ALL ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'get_training_load' LIMIT 1), 'EXECUTE')
  THEN
    RAISE EXCEPTION 'get_training_load est exécutable par PUBLIC après cette migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_training_load' AND prosrc ILIKE '%GROUP BY m.id, m.date, m.team_id, m.opponent_team, m.players%'
  ) THEN
    RAISE EXCEPTION 'get_training_load : le fix du GROUP BY (m.players) n''est pas en place';
  END IF;
END;
$verify$;
