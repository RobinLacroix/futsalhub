-- Synchronisation automatique des colonnes goals_by_type et conceded_by_type de matches
-- à partir des événements goal/opponent_goal dans match_events.
-- Les triggers incrémentent/décrémentent les compteurs à chaque INSERT/DELETE/UPDATE.

CREATE OR REPLACE FUNCTION sync_match_goals_by_type_from_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_event_type TEXT;
  v_goal_type TEXT;
  v_delta INTEGER;
  v_col TEXT;
  v_current JSONB;
  v_new_val INTEGER;
  v_default JSONB := '{"offensive":0,"transition":0,"cpa":0,"superiority":0}'::jsonb;
BEGIN
  -- Procédure interne : appliquer delta pour un event
  IF TG_OP = 'DELETE' THEN
    v_match_id := OLD.match_id;
    v_event_type := OLD.event_type;
    v_goal_type := COALESCE(NULLIF(trim(OLD.goal_type), ''), 'offensive');
    v_delta := -1;
  ELSIF TG_OP = 'INSERT' THEN
    v_match_id := NEW.match_id;
    v_event_type := NEW.event_type;
    v_goal_type := COALESCE(NULLIF(trim(NEW.goal_type), ''), 'offensive');
    v_delta := 1;
  ELSIF TG_OP = 'UPDATE' THEN
    -- D'abord décrémenter l'ancien (si c'était un but)
    IF OLD.event_type IN ('goal', 'opponent_goal') THEN
      v_goal_type := COALESCE(NULLIF(trim(OLD.goal_type), ''), 'offensive');
      IF v_goal_type NOT IN ('offensive', 'transition', 'cpa', 'superiority') THEN v_goal_type := 'offensive'; END IF;
      v_col := CASE WHEN OLD.event_type = 'goal' THEN 'goals_by_type' ELSE 'conceded_by_type' END;
      SELECT COALESCE(CASE WHEN v_col = 'goals_by_type' THEN goals_by_type ELSE conceded_by_type END, v_default)
        INTO v_current FROM matches WHERE id = OLD.match_id;
      v_new_val := GREATEST(0, COALESCE((v_current ->> v_goal_type)::int, 0) - 1);
      v_current := jsonb_set(v_current, ARRAY[v_goal_type], to_jsonb(v_new_val));
      IF v_col = 'goals_by_type' THEN
        UPDATE matches SET goals_by_type = v_current WHERE id = OLD.match_id;
      ELSE
        UPDATE matches SET conceded_by_type = v_current WHERE id = OLD.match_id;
      END IF;
    END IF;
    -- Puis incrémenter le nouveau (si c'est un but)
    IF NEW.event_type IN ('goal', 'opponent_goal') THEN
      v_match_id := NEW.match_id;
      v_event_type := NEW.event_type;
      v_goal_type := COALESCE(NULLIF(trim(NEW.goal_type), ''), 'offensive');
      v_delta := 1;
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  IF v_event_type NOT IN ('goal', 'opponent_goal') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_goal_type NOT IN ('offensive', 'transition', 'cpa', 'superiority') THEN
    v_goal_type := 'offensive';
  END IF;

  v_col := CASE WHEN v_event_type = 'goal' THEN 'goals_by_type' ELSE 'conceded_by_type' END;
  SELECT COALESCE(CASE WHEN v_col = 'goals_by_type' THEN goals_by_type ELSE conceded_by_type END, v_default)
    INTO v_current FROM matches WHERE id = v_match_id;
  v_new_val := GREATEST(0, COALESCE((v_current ->> v_goal_type)::int, 0) + v_delta);
  v_current := jsonb_set(v_current, ARRAY[v_goal_type], to_jsonb(v_new_val));

  IF v_col = 'goals_by_type' THEN
    UPDATE matches SET goals_by_type = v_current WHERE id = v_match_id;
  ELSE
    UPDATE matches SET conceded_by_type = v_current WHERE id = v_match_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_match_events_sync_goals_by_type ON match_events;
CREATE TRIGGER trg_match_events_sync_goals_by_type
  AFTER INSERT OR DELETE OR UPDATE OF event_type, goal_type
  ON match_events
  FOR EACH ROW
  EXECUTE FUNCTION sync_match_goals_by_type_from_events();

COMMENT ON FUNCTION sync_match_goals_by_type_from_events() IS 'Met à jour goals_by_type et conceded_by_type de matches lors des insert/delete/update sur match_events (goal/opponent_goal).';

-- Réinitialiser les données existantes à partir des events (pour les matchs qui ont des buts)
WITH agg AS (
  SELECT
    match_id,
    jsonb_build_object(
      'offensive', COALESCE(SUM((CASE WHEN event_type = 'goal' AND (goal_type IS NULL OR goal_type = 'offensive') THEN 1 ELSE 0 END))::int, 0),
      'transition', COALESCE(SUM((CASE WHEN event_type = 'goal' AND goal_type = 'transition' THEN 1 ELSE 0 END))::int, 0),
      'cpa', COALESCE(SUM((CASE WHEN event_type = 'goal' AND goal_type = 'cpa' THEN 1 ELSE 0 END))::int, 0),
      'superiority', COALESCE(SUM((CASE WHEN event_type = 'goal' AND goal_type = 'superiority' THEN 1 ELSE 0 END))::int, 0)
    ) AS gb,
    jsonb_build_object(
      'offensive', COALESCE(SUM((CASE WHEN event_type = 'opponent_goal' AND (goal_type IS NULL OR goal_type = 'offensive') THEN 1 ELSE 0 END))::int, 0),
      'transition', COALESCE(SUM((CASE WHEN event_type = 'opponent_goal' AND goal_type = 'transition' THEN 1 ELSE 0 END))::int, 0),
      'cpa', COALESCE(SUM((CASE WHEN event_type = 'opponent_goal' AND goal_type = 'cpa' THEN 1 ELSE 0 END))::int, 0),
      'superiority', COALESCE(SUM((CASE WHEN event_type = 'opponent_goal' AND goal_type = 'superiority' THEN 1 ELSE 0 END))::int, 0)
    ) AS cb
  FROM match_events
  WHERE event_type IN ('goal', 'opponent_goal')
  GROUP BY match_id
)
UPDATE matches m SET
  goals_by_type = agg.gb,
  conceded_by_type = agg.cb
FROM agg
WHERE m.id = agg.match_id;
