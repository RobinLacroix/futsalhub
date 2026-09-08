-- Le calendrier joueur (mobile ET web, `app/webapp/player/calendar/page.tsx` et
-- `mobile/app/(player-tabs)/index.tsx` appellent la même RPC) affichait encore
-- les entraînements et matchs de la veille : la borne basse du filtre partait
-- de minuit HIER (Europe/Paris), pas minuit AUJOURD'HUI. Jusqu'à ~48h
-- d'événements déjà passés pouvaient rester visibles dans une liste titrée
-- « Aucune convocation à venir ». Signalé par Robin (2026-08-18) : les
-- événements passés doivent disparaître.
--
-- Seul changement : `v_from_paris` perd son `- INTERVAL '1 day'`. Le reste de
-- la fonction (identités, filtrage par équipe/convocation) est copié à
-- l'identique depuis la version en base (vérifiée via pg_proc, cf. CLAUDE.md —
-- les migrations ne sont pas une source de vérité fiable du schéma).
CREATE OR REPLACE FUNCTION public.get_my_calendar_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id UUID;
  v_team_ids UUID[];
  v_from_paris TIMESTAMPTZ;
  v_trainings JSONB;
  v_matches JSONB;
BEGIN
  SELECT id INTO v_player_id
  FROM players
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('trainings', '[]'::jsonb, 'matches', '[]'::jsonb);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT t.team_id), ARRAY[]::UUID[]) INTO v_team_ids
  FROM (
    SELECT pt.team_id FROM player_teams pt WHERE pt.player_id = v_player_id
    UNION
    SELECT p.team_id FROM players p WHERE p.id = v_player_id AND p.team_id IS NOT NULL
  ) AS t(team_id);

  -- Ne plus retourner vide si le joueur n'a aucune équipe : il peut être convoqué ailleurs
  -- Minuit AUJOURD'HUI (Europe/Paris) : les événements d'hier et d'avant ne sont plus repris.
  v_from_paris := ((NOW() AT TIME ZONE 'Europe/Paris')::date::timestamp AT TIME ZONE 'Europe/Paris');

  -- Entraînements : (équipe du joueur ET convocation) OU convoqué par une autre équipe (dans convoked_players)
  -- is_other_team = true quand convoqué par une équipe autre que les siennes (pour affichage couleur)
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.training_date), '[]'::jsonb) INTO v_trainings
  FROM (
    SELECT
      tr.id AS training_id,
      tr.date AS training_date,
      tr.location,
      t.name AS team_name,
      (tr.attendance->>v_player_id::text)::text AS my_status,
      tft.token AS feedback_token,
      (CASE WHEN tft.token IS NOT NULL THEN ('/feedback/session/' || tft.token)::text ELSE NULL END) AS feedback_url,
      (tr.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team
    FROM trainings tr
    JOIN teams t ON t.id = tr.team_id
    LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
      AND tft.player_id = v_player_id
      AND tft.used_at IS NULL
      AND tft.expires_at > NOW()
    WHERE tr.date >= v_from_paris
      AND (
        -- Cas 1 : séance d'une de ses équipes ET (convoked_players vide ou il est convoqué)
        (
          tr.team_id = ANY(v_team_ids)
          AND (
            tr.convoked_players IS NULL
            OR tr.convoked_players = '[]'::jsonb
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(tr.convoked_players) AS elem
              WHERE elem->>'id' = v_player_id::text
            )
          )
        )
        -- Cas 2 : convoqué par une autre équipe (présent dans convoked_players)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

  -- Matchs : inclure tous les matchs où le joueur est dans la liste players (son équipe ou invité)
  SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.match_date), '[]'::jsonb) INTO v_matches
  FROM (
    SELECT
      m.id AS match_id,
      m.date AS match_date,
      m.title,
      m.location,
      m.competition,
      m.opponent_team,
      t.name AS team_name,
      (m.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team
    FROM matches m
    JOIN teams t ON t.id = m.team_id
    WHERE m.date >= v_from_paris
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
        WHERE elem->>'id' = v_player_id::text
      )
  ) row;

  RETURN jsonb_build_object('trainings', COALESCE(v_trainings, '[]'::jsonb), 'matches', COALESCE(v_matches, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_calendar_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_events() TO authenticated;
