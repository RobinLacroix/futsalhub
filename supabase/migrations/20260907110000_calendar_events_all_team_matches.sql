-- get_my_calendar_events : le calendrier joueur ne montrait un match que si le
-- joueur figurait dans matches.players (= convoqué). Demande Robin (2026-09-07) :
-- un joueur doit voir TOUS les matchs de son (ses) équipe(s), convoqué ou non
-- (utile pour anticiper le calendrier, pas seulement les matchs où il joue).
--
-- Même bascule que les entraînements (cf. 20260822190000) : la visibilité passe
-- de « je suis dans la liste des joueurs » à « c'est un match de mon équipe »
-- (OU convoqué par une autre équipe, cas déjà géré pour les séances). La
-- convocation réelle reste exposée via `is_convoked`, pour que le client
-- affiche « Non convoqué » plutôt que de laisser croire au joueur qu'il joue.
--
-- Reste identique par ailleurs (copié depuis la version en base, vérifiée via
-- pg_proc, cf. CLAUDE.md — les migrations ne sont pas une source de vérité
-- fiable du schéma) : trainings inchangés, résolution identité/équipes inchangée.
CREATE OR REPLACE FUNCTION public.get_my_calendar_events()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  v_from_paris := ((NOW() AT TIME ZONE 'Europe/Paris')::date::timestamp AT TIME ZONE 'Europe/Paris');

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
      (tr.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team,
      t.absence_notice_minutes,
      t.late_notice_minutes
    FROM trainings tr
    JOIN teams t ON t.id = tr.team_id
    LEFT JOIN training_feedback_tokens tft ON tft.training_id = tr.id
      AND tft.player_id = v_player_id
      AND tft.used_at IS NULL
      AND tft.expires_at > NOW()
    WHERE tr.date >= v_from_paris
      AND (
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
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(tr.convoked_players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

  -- Matchs : équipe du joueur (convoqué ou non) OU convoqué par une autre équipe.
  -- `is_convoked` distingue les deux cas côté client (badge « Non convoqué »).
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
      (m.team_id <> ALL(COALESCE(v_team_ids, ARRAY[]::UUID[])) OR array_length(v_team_ids, 1) IS NULL) AS is_other_team,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
        WHERE elem->>'id' = v_player_id::text
      ) AS is_convoked
    FROM matches m
    JOIN teams t ON t.id = m.team_id
    WHERE m.date >= v_from_paris
      AND (
        m.team_id = ANY(v_team_ids)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(m.players, '[]'::jsonb)) AS elem
          WHERE elem->>'id' = v_player_id::text
        )
      )
  ) row;

  RETURN jsonb_build_object('trainings', COALESCE(v_trainings, '[]'::jsonb), 'matches', COALESCE(v_matches, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_calendar_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_events() TO authenticated;

-- ── Vérification ──────────────────────────────────────────────────────────────
-- Même requête que le garde-fou §15 de 20260803100000, scopée à cette fonction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.proname = 'get_my_calendar_events'
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
    RAISE EXCEPTION 'get_my_calendar_events : joignable par PUBLIC ou anon — le REVOKE ci-dessus n''a pas tenu';
  END IF;
END $$;
