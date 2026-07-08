-- Rattachement des matchs et entraînements à une saison.
-- Objectif : isoler les données par saison (règle juillet → juin) pour qu'une
-- nouvelle saison ne soit pas polluée par l'historique de la précédente.
-- Modèle aligné sur season_planning (season VARCHAR par club, pas de table
-- seasons dédiée).
-- Non destructif : ajout de colonnes + backfill idempotent depuis la date.

-- ── 0. Helper : saison "YYYY-YYYY" pour une date (règle juillet → juin) ────────
--    Aligné sur currentSeason() côté app : bascule au 1er juillet.
CREATE OR REPLACE FUNCTION futsal_season_for_date(d timestamptz)
RETURNS varchar
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM d) >= 7
      THEN EXTRACT(YEAR FROM d)::int || '-' || (EXTRACT(YEAR FROM d)::int + 1)
    ELSE (EXTRACT(YEAR FROM d)::int - 1) || '-' || EXTRACT(YEAR FROM d)::int
  END;
$$;

-- ── 1. Saison active au niveau club ───────────────────────────────────────────
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS current_season VARCHAR(20);
UPDATE clubs
  SET current_season = futsal_season_for_date(now())
  WHERE current_season IS NULL;

-- ── 2. Colonne season sur matches / trainings ─────────────────────────────────
ALTER TABLE matches   ADD COLUMN IF NOT EXISTS season VARCHAR(20);
ALTER TABLE trainings ADD COLUMN IF NOT EXISTS season VARCHAR(20);

-- ── 3. Backfill depuis la date (idempotent : ne touche que les lignes non taguées)
DO $$
DECLARE
  v_matches   bigint;
  v_trainings bigint;
BEGIN
  UPDATE matches   SET season = futsal_season_for_date(date) WHERE season IS NULL;
  GET DIAGNOSTICS v_matches = ROW_COUNT;
  UPDATE trainings SET season = futsal_season_for_date(date) WHERE season IS NULL;
  GET DIAGNOSTICS v_trainings = ROW_COUNT;
  RAISE NOTICE 'Backfill saison : % matchs, % entrainements taggés.', v_matches, v_trainings;
END $$;

-- ── 4. Trigger : tague automatiquement toute nouvelle ligne ────────────────────
--    Priorité : clubs.current_season (via team → club).
--    Fallback : saison dérivée de la date.
--    Blinde aussi les insertions directes qui court-circuitent la couche service.
CREATE OR REPLACE FUNCTION set_season_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_season varchar;
BEGIN
  IF NEW.season IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    SELECT c.current_season INTO v_season
    FROM teams t
    JOIN clubs c ON c.id = t.club_id
    WHERE t.id = NEW.team_id;
  END IF;

  NEW.season := COALESCE(v_season, futsal_season_for_date(NEW.date));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_season_matches ON matches;
CREATE TRIGGER trg_set_season_matches
  BEFORE INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION set_season_on_insert();

DROP TRIGGER IF EXISTS trg_set_season_trainings ON trainings;
CREATE TRIGGER trg_set_season_trainings
  BEFORE INSERT ON trainings
  FOR EACH ROW EXECUTE FUNCTION set_season_on_insert();

-- ── 5. Index de filtrage ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS matches_team_season_idx   ON matches   (team_id, season);
CREATE INDEX IF NOT EXISTS trainings_team_season_idx ON trainings (team_id, season);

-- ── 6. RPC : avancer la saison active du club (rollover) ───────────────────────
--    Réservé admin/coach. Les nouveaux matchs/entraînements seront alors taggés
--    sur la nouvelle saison via le trigger.
CREATE OR REPLACE FUNCTION advance_club_season(p_club_id UUID, p_new_season VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_club_write_access(p_club_id) THEN
    RAISE EXCEPTION 'Accès refusé : droits admin/coach requis sur le club.';
  END IF;

  UPDATE clubs
    SET current_season = p_new_season, updated_at = now()
    WHERE id = p_club_id;

  RETURN p_new_season;
END $$;

REVOKE ALL ON FUNCTION advance_club_season(UUID, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION advance_club_season(UUID, VARCHAR) TO authenticated;

COMMENT ON FUNCTION advance_club_season(UUID, VARCHAR) IS
  'Avance la saison active du club (rollover). Réservé admin/coach du club.';
