-- ═════════════════════════════════════════════════════════════════════════════
-- Mode Séance Live : plateaux (chasubles) et jeux chronométrés/scorés d'une
-- séance d'entraînement. Reprend le modèle de LOT C
-- (livrables/futsalhub/SPEC_FEATURES_BETA_2026-08.md §5, arbitré 13/08/2026,
-- jamais implémenté), étendu avec un chrono à séries/repos
-- (docs/superpowers/specs/2026-09-23-mode-seance-live-design.md).
--
-- Décisions à ne pas défaire (cf. design doc §1) :
--  - Composition figée PAR JEU, pas par séance (training_game_players).
--  - Score = deux entiers bruts par jeu, jamais ventilé, jamais d'attribution
--    de buteur — aucune table d'événements ici, volontairement.
--  - club_id est DÉRIVÉ par trigger depuis training_id, jamais fourni par le
--    client — élimine par construction le risque qu'un client cohérent en
--    apparence associe un training_id d'un club à un club_id d'un autre club
--    où il a un accès en écriture.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_squads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  label       text NOT NULL,
  color_token text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_squads IS
  'Plateaux (chasubles) d''une séance — scope training, pas club. Nom distinct de teams pour éviter la collision de vocabulaire avec les équipes du club.';
COMMENT ON COLUMN public.training_squads.color_token IS
  'Index/clé dans theme.colors.chartSeries côté mobile — jamais un hex stocké ici.';

CREATE INDEX IF NOT EXISTS idx_training_squads_training_id ON public.training_squads (training_id);

CREATE TABLE IF NOT EXISTS public.training_games (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id            uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  club_id                uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  sequence               smallint NOT NULL,
  part_index             smallint,
  procedure_id           uuid REFERENCES public.training_procedures(id) ON DELETE SET NULL,
  label                  text,
  score_unit_label       text,
  home_squad_id          uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  away_squad_id          uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  score_home             smallint NOT NULL DEFAULT 0,
  score_away             smallint NOT NULL DEFAULT 0,
  timer_mode             text NOT NULL DEFAULT 'continu' CHECK (timer_mode IN ('continu', 'series')),
  series_count           smallint,
  series_duration_seconds integer,
  rest_duration_seconds  integer,
  duration_seconds       integer,
  started_at             timestamptz,
  ended_at               timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_id, sequence),
  CHECK (home_squad_id <> away_squad_id),
  CHECK (
    (timer_mode = 'continu' AND series_count IS NULL AND series_duration_seconds IS NULL AND rest_duration_seconds IS NULL)
    OR
    (timer_mode = 'series' AND series_count > 0 AND series_duration_seconds > 0 AND rest_duration_seconds >= 0)
  )
);

COMMENT ON TABLE public.training_games IS
  'Un jeu chronométré/scoré de la séance. score_unit_label est un libellé DESCRIPTIF ("buts", "récupérations"), affiché, jamais agrégé — ne jamais sommer des score_home/score_away entre jeux d''unités différentes.';
COMMENT ON COLUMN public.training_games.part_index IS
  'Indice dans trainings.session_parts / lien futur vers le bloc de l''assembleur de séance — posé sans UI pour cette itération.';

CREATE INDEX IF NOT EXISTS idx_training_games_training_id ON public.training_games (training_id, sequence);

CREATE TABLE IF NOT EXISTS public.training_game_players (
  game_id   uuid NOT NULL REFERENCES public.training_games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  squad_id  uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  club_id   uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, player_id)
);

COMMENT ON TABLE public.training_game_players IS
  'Composition FIGÉE PAR JEU (pas par séance) — le rebrassage des plateaux entre deux jeux est le cœur de la manipulation des supériorités numériques. Une composition au niveau séance rendrait tout cumul joueur faux dès le premier rebrassage.';

CREATE INDEX IF NOT EXISTS idx_training_game_players_game_id ON public.training_game_players (game_id);
CREATE INDEX IF NOT EXISTS idx_training_game_players_player_id ON public.training_game_players (player_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. club_id dérivé par trigger, jamais fourni par le client (BEFORE INSERT).
-- Même patron que training_sessions_fill_ownership (20260921100000 §2), mais
-- la source de vérité ici est training_id → trainings.club_id, pas
-- club_members : ces lignes appartiennent à UN entraînement précis, pas au
-- choix libre du créateur.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.training_squads_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.trainings WHERE id = NEW.training_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'training_id % introuvable ou sans club_id.', NEW.training_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_squads_fill_club_id_trg ON public.training_squads;
CREATE TRIGGER training_squads_fill_club_id_trg
  BEFORE INSERT ON public.training_squads
  FOR EACH ROW EXECUTE FUNCTION public.training_squads_fill_club_id();

CREATE OR REPLACE FUNCTION public.training_games_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.trainings WHERE id = NEW.training_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'training_id % introuvable ou sans club_id.', NEW.training_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_games_fill_club_id_trg ON public.training_games;
CREATE TRIGGER training_games_fill_club_id_trg
  BEFORE INSERT ON public.training_games
  FOR EACH ROW EXECUTE FUNCTION public.training_games_fill_club_id();

CREATE OR REPLACE FUNCTION public.training_game_players_fill_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT club_id INTO NEW.club_id FROM public.training_games WHERE id = NEW.game_id;
  IF NEW.club_id IS NULL THEN
    RAISE EXCEPTION 'game_id % introuvable.', NEW.game_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS training_game_players_fill_club_id_trg ON public.training_game_players;
CREATE TRIGGER training_game_players_fill_club_id_trg
  BEFORE INSERT ON public.training_game_players
  FOR EACH ROW EXECUTE FUNCTION public.training_game_players_fill_club_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Privilèges de table
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.training_squads FROM PUBLIC;
REVOKE ALL ON TABLE public.training_squads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_squads TO authenticated;

REVOKE ALL ON TABLE public.training_games FROM PUBLIC;
REVOKE ALL ON TABLE public.training_games FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_games TO authenticated;

REVOKE ALL ON TABLE public.training_game_players FROM PUBLIC;
REVOKE ALL ON TABLE public.training_game_players FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.training_game_players TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. RLS — lecture has_club_access, écriture has_club_write_access. club_id
-- étant dérivé par trigger (§2), WITH CHECK sur club_id porte uniquement sur
-- l'accès écriture de l'utilisateur, pas sur la cohérence training/club (déjà
-- garantie par le trigger, qui tourne avant l'évaluation de la policy).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_squads_select ON public.training_squads FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_squads_insert ON public.training_squads FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.trainings WHERE id = training_id)));
CREATE POLICY training_squads_update ON public.training_squads FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));
CREATE POLICY training_squads_delete ON public.training_squads FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

ALTER TABLE public.training_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_games_select ON public.training_games FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_games_insert ON public.training_games FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.trainings WHERE id = training_id)));
CREATE POLICY training_games_update ON public.training_games FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));
CREATE POLICY training_games_delete ON public.training_games FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

ALTER TABLE public.training_game_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_game_players_select ON public.training_game_players FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_game_players_insert ON public.training_game_players FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.training_games WHERE id = game_id)));
CREATE POLICY training_game_players_delete ON public.training_game_players FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

-- Note : la garde §15 de 20260803100000 échoue toute migration qui laisse une
-- fonction DEFINER exécutable par PUBLIC. Les trois triggers ci-dessus sont
-- des fonctions trigger (pas des RPC appelables directement) mais héritent du
-- même défaut PUBLIC — REVOKE explicite par prudence, même si non requis pour
-- une fonction trigger (jamais appelée via /rest/v1/rpc/).
REVOKE ALL ON FUNCTION public.training_squads_fill_club_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_games_fill_club_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_game_players_fill_club_id() FROM PUBLIC;

COMMIT;
