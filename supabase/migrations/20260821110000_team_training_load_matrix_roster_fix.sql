-- ═════════════════════════════════════════════════════════════════════════════
-- Matrice individuelle de charge — effectif réel, pas la colonne legacy
--
-- `get_team_training_load_matrix` (20260814140000, bornée en saison par
-- 20260821100000) tirait son `roster` depuis `public.players.team_id` :
--
--   roster AS (
--     SELECT p.id AS player_id, p.first_name, p.last_name, p.number
--     FROM public.players p
--     WHERE p.team_id = p_team_id
--   )
--
-- Or `players.team_id` est une colonne héritée d'avant le support multi-équipe.
-- Le reste de l'application (`getPlayersByTeam`, mobile ET web) résout déjà
-- l'effectif via la table de jointure `player_teams`, remplie/reconstruite à
-- chaque bascule de saison par `applySeasonPlan`/`advanceClubSeason` — c'est
-- elle, pas `players.team_id`, qui reflète l'effectif de la saison en cours.
-- Un effectif géré uniquement via la planification de saison (le cas courant)
-- ne peuple jamais `players.team_id`, donc `roster` restait VIDE : avec un
-- roster vide, le `CROSS JOIN roster r` de la requête ne peut produire AUCUNE
-- ligne, quel que soit le nombre de séances trouvées — d'où « Aucune séance
-- récente » alors que `get_training_load` (qui ne dépend pas de l'effectif)
-- affichait ces mêmes séances sans problème.
--
-- Le fix reprend exactement la requête de `getPlayersByTeam`
-- (`lib/services/players.ts` / `mobile/lib/services/players.ts`) : jointure
-- par `player_teams.team_id`, et exclusion de `status = 'left'` — un joueur
-- parti peut garder une ligne `player_teams` orpheline (c'est déjà le cas
-- géré côté TypeScript), il ne doit pas réapparaître ici.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_team_training_load_matrix(
  p_club_id uuid,
  p_team_id uuid,
  p_limit   integer DEFAULT 5,
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL
)
RETURNS TABLE (
  training_id      uuid,
  session_date     date,
  theme            text,
  session_duration integer,
  target_rpe_min   smallint,
  target_rpe_max   smallint,
  player_id        uuid,
  first_name       text,
  last_name        text,
  number           integer,
  convoked         boolean,
  rpe              smallint,
  physical_form    smallint,
  pleasure         smallint,
  auto_evaluation  smallint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.has_club_medical_access(p_club_id) THEN
    RAISE EXCEPTION 'Acces refuse au club %', p_club_id;
  END IF;

  RETURN QUERY
  WITH last_sessions AS (
    SELECT
      t.id,
      (t.date AT TIME ZONE 'Europe/Paris')::date AS session_date,
      t.theme,
      t.session_duration,
      t.target_rpe_min,
      t.target_rpe_max,
      t.attendance,
      t.convoked_players
    FROM public.trainings t
    LEFT JOIN public.teams tm ON tm.id = t.team_id
    WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
      AND t.team_id = p_team_id
      AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
      AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
    ORDER BY t.date DESC
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
      (s.attendance ? r.player_id::text)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(s.convoked_players, '[]'::jsonb)) e
        WHERE e->>'id' = r.player_id::text
      )
    ) AS convoked,
    f.rpe,
    f.physical_form,
    f.pleasure,
    f.auto_evaluation
  FROM last_sessions s
  CROSS JOIN roster r
  LEFT JOIN public.training_player_feedback f
    ON f.training_id = s.id AND f.player_id = r.player_id
  ORDER BY s.session_date, r.last_name, r.first_name;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_training_load_matrix(uuid, uuid, integer, date, date) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 5;

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_team_training_load_matrix (5 arguments) absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 5)
     NOT LIKE '%has_club_medical_access%' THEN
    RAISE EXCEPTION 'get_team_training_load_matrix n''utilise pas la garde de donnees de sante';
  END IF;

  -- Le roster doit venir de `player_teams`, plus de la colonne legacy
  -- `players.team_id` : c'est exactement le bug corrige par cette migration.
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_team_training_load_matrix' AND p.pronargs = 5)
     NOT LIKE '%player_teams%' THEN
    RAISE EXCEPTION 'get_team_training_load_matrix ne joint pas player_teams';
  END IF;

  RAISE NOTICE 'get_team_training_load_matrix (effectif via player_teams) verifiee.';
END
$mig$;
