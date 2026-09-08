-- Demande du préparateur physique : filtrer la charge/RPE d'équipe par poste,
-- notamment pour exclure les gardiens (poste à part) de la moyenne d'équipe.
--
-- `get_training_load` agrège déjà côté SQL (rpe_mean, response_count...) à
-- partir de `training_player_feedback` : impossible de filtrer par poste après
-- coup côté client, la ligne par joueur n'atteint jamais l'app. Le filtre doit
-- donc vivre ici.
--
-- Point d'attention : `convoked_count` ne doit PAS rester non filtré pendant
-- que `response_count`/les moyennes le sont — sinon le taux de réponse
-- (`responseRate`, cf. lib/trainingLoad.ts) devient faux dans le sens qui fait
-- croire à une charge fiable alors qu'elle ne compte qu'une partie de
-- l'effectif au numérateur. Les deux compteurs sont donc filtrés par le même
-- p_positions.

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
  SELECT
    t.id,
    (t.date AT TIME ZONE 'Europe/Paris')::date,
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
    ),
    COUNT(f.id) FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::integer,
    ROUND(AVG(f.rpe)            FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2),
    ROUND(AVG(f.auto_evaluation) FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2),
    ROUND(AVG(f.physical_form)   FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2),
    ROUND(AVG(f.pleasure)        FILTER (WHERE p_positions IS NULL OR pf.position = ANY(p_positions))::numeric, 2)
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
  ORDER BY t.date;
END
$$;

REVOKE ALL ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_load(UUID, UUID, DATE, DATE, TEXT[]) TO authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF has_function_privilege('public', (SELECT oid FROM pg_proc WHERE proname = 'get_training_load' LIMIT 1), 'EXECUTE') THEN
    RAISE EXCEPTION 'get_training_load ne doit pas être exécutable par PUBLIC';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_training_load' AND pg_get_function_identity_arguments(oid) ILIKE '%p_positions%'
  ) THEN
    RAISE EXCEPTION 'get_training_load devrait accepter p_positions après cette migration';
  END IF;
END;
$verify$;
