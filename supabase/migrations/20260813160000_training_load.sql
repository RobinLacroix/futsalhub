-- ═════════════════════════════════════════════════════════════════════════════
-- LOT A (complet) — Charge d'entraînement et wellness
--
-- À jouer dans le SQL Editor encadré par BEGIN; / COMMIT;
--
-- Aucune table créée : tout est déjà en base depuis fin juillet.
-- `training_player_feedback` porte rpe / auto_evaluation / physical_form /
-- pleasure sur une échelle de 1 à 10, `trainings.session_duration` porte les
-- minutes. Il ne manquait qu'une lecture agrégée.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Ce que cette fonction renvoie, et ce qu'elle NE calcule PAS
--
-- Elle renvoie UNE LIGNE PAR SÉANCE : durée, nombre de convoqués, nombre de
-- réponses, et les moyennes des quatre métriques. Les roulements hebdomadaires,
-- la monotonie et la détection de pic sont calculés côté application, dans
-- `lib/trainingLoad.ts` (dupliqué web/mobile).
--
-- Ce partage n'est pas arbitraire. La monotonie de Foster se calcule sur les
-- SEPT jours de la semaine, jours de repos inclus à charge zéro — c'est
-- précisément ce qui lui donne son sens, une semaine à trois séances et quatre
-- jours de repos étant très variable donc peu monotone. Écrire ça en SQL
-- demanderait de générer un calendrier ; l'écrire une fois dans le modèle
-- partagé le rend lisible et vérifiable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Le taux de réponse est renvoyé avec CHAQUE ligne, et ce n'est pas décoratif
--
-- Une charge hebdomadaire calculée sur 40 % de réponses est un chiffre faux
-- présenté comme vrai. Le nombre de convoqués et le nombre de répondants
-- voyagent donc avec la moyenne, pour que l'écran puisse afficher la couverture
-- à côté de tout agrégat et griser ce qui n'est pas fiable.
--
-- Le dénominateur est le nombre de CONVOQUÉS, pas l'effectif : un joueur non
-- convoqué n'avait pas à répondre, l'inclure ferait chuter artificiellement le
-- taux et rendrait la garde inutilisable.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_training_load(
  p_club_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_from    date DEFAULT NULL,
  p_to      date DEFAULT NULL
)
RETURNS TABLE (
  training_id         uuid,
  session_date        date,
  team_id             uuid,
  theme               text,
  session_duration    integer,
  convoked_count      integer,
  response_count      integer,
  rpe_mean            numeric,
  auto_evaluation_mean numeric,
  physical_form_mean  numeric,
  pleasure_mean       numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- RPE et wellness sont des données de santé : `viewer` reste dehors.
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
    -- `convoked_players` est un tableau JSONB d'objets {id}. Une séance
    -- historique peut l'avoir vide : on retombe alors sur `attendance`, qui
    -- porte une clé par joueur convoqué.
    GREATEST(
      COALESCE(jsonb_array_length(NULLIF(t.convoked_players, 'null'::jsonb)), 0),
      COALESCE((SELECT COUNT(*)::int FROM jsonb_object_keys(COALESCE(t.attendance, '{}'::jsonb))), 0)
    ),
    COUNT(f.id)::integer,
    ROUND(AVG(f.rpe)::numeric, 2),
    ROUND(AVG(f.auto_evaluation)::numeric, 2),
    ROUND(AVG(f.physical_form)::numeric, 2),
    ROUND(AVG(f.pleasure)::numeric, 2)
  FROM public.trainings t
  LEFT JOIN public.teams tm ON tm.id = t.team_id
  LEFT JOIN public.training_player_feedback f ON f.training_id = t.id
  WHERE COALESCE(t.club_id, tm.club_id) = p_club_id
    AND (p_team_id IS NULL OR t.team_id = p_team_id)
    AND (p_from IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date >= p_from)
    AND (p_to   IS NULL OR (t.date AT TIME ZONE 'Europe/Paris')::date <= p_to)
  GROUP BY t.id, t.date, t.team_id, t.theme, t.session_duration,
           t.convoked_players, t.attendance
  ORDER BY t.date;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_training_load(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_load(uuid, uuid, date, date) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- Garde-fou
-- ═════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_training_load';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'get_training_load absente apres migration';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut executer %', v_sig;
  END IF;

  -- La garde doit être celle des données de santé, pas `has_club_access` :
  -- un `viewer` ne doit jamais lire le RPE ni le wellness d'un joueur.
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_training_load')
     NOT LIKE '%has_club_medical_access%' THEN
    RAISE EXCEPTION 'get_training_load n''utilise pas la garde de donnees de sante';
  END IF;

  RAISE NOTICE 'get_training_load verifiee.';
END
$mig$;
