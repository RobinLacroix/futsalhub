-- Rend get_coach_calendar_data season-aware.
-- Ajoute un paramètre p_season : quand il est NULL, la RPC filtre sur la saison
-- active du club (clubs.current_season). Le calendrier mobile n'affiche donc que
-- la saison active par défaut, et bascule automatiquement après un rollover.
-- Sécurité inchangée : SECURITY DEFINER, réservé authenticated (anon révoqué),
-- accès borné par get_user_club_id() + has_team_access().

-- L'ancienne signature (UUID) est remplacée par (UUID, VARCHAR). On la drop
-- d'abord car CREATE OR REPLACE ne peut pas changer la liste d'arguments.
DROP FUNCTION IF EXISTS get_coach_calendar_data(UUID);

CREATE OR REPLACE FUNCTION get_coach_calendar_data(
  p_team_id UUID DEFAULT NULL,
  p_season VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_teams JSONB;
  v_trainings JSONB;
  v_matches JSONB;
BEGIN
  v_club_id := get_user_club_id();
  IF v_club_id IS NULL THEN
    RETURN jsonb_build_object('teams', '[]'::jsonb, 'trainings', '[]'::jsonb, 'matches', '[]'::jsonb);
  END IF;

  -- Saison de filtrage : celle demandée, sinon la saison active du club.
  IF p_season IS NULL THEN
    SELECT current_season INTO p_season FROM clubs WHERE id = v_club_id;
  END IF;

  -- Équipes du club (id, name, category, level, color, club_id)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'level', t.level, 'color', t.color, 'club_id', t.club_id)
    ORDER BY t.name
  ), '[]'::jsonb) INTO v_teams
  FROM teams t
  WHERE t.club_id = v_club_id;

  -- Si p_team_id fourni et valide : charger entraînements et matchs.
  -- Si p_team_id NULL : utiliser la première équipe du club (pour premier chargement).
  IF p_team_id IS NULL AND v_teams IS NOT NULL AND jsonb_array_length(v_teams) > 0 THEN
    p_team_id := (v_teams->0->>'id')::UUID;
  END IF;

  IF p_team_id IS NOT NULL AND has_team_access(p_team_id) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(tr)::jsonb ORDER BY tr.date DESC NULLS LAST), '[]'::jsonb) INTO v_trainings
    FROM (
      SELECT id, date, theme, COALESCE(location, '') AS location, team_id, season
      FROM trainings
      WHERE team_id = p_team_id
        AND (p_season IS NULL OR season = p_season)
      ORDER BY date DESC
      LIMIT 200
    ) tr;

    SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.date DESC NULLS LAST), '[]'::jsonb) INTO v_matches
    FROM (
      SELECT id, date, title, COALESCE(location, '') AS location, COALESCE(competition, '') AS competition,
        score_team, score_opponent, team_id, season
      FROM matches
      WHERE team_id = p_team_id
        AND (p_season IS NULL OR season = p_season)
      ORDER BY date DESC
      LIMIT 200
    ) m;
  ELSE
    v_trainings := '[]'::jsonb;
    v_matches := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'teams', COALESCE(v_teams, '[]'::jsonb),
    'trainings', COALESCE(v_trainings, '[]'::jsonb),
    'matches', COALESCE(v_matches, '[]'::jsonb)
  );
END;
$$;

-- Grants : authenticated uniquement (on ne réintroduit pas anon).
REVOKE ALL ON FUNCTION get_coach_calendar_data(UUID, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_coach_calendar_data(UUID, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION get_coach_calendar_data(UUID, VARCHAR) TO authenticated;

COMMENT ON FUNCTION get_coach_calendar_data(UUID, VARCHAR) IS
  'Retourne { teams, trainings, matches } en un appel, filtré sur la saison (p_season, défaut = saison active du club). Entraînements et matchs allégés.';
