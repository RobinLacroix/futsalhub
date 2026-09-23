-- ═════════════════════════════════════════════════════════════════════════════
-- Mode Séance Live : jeux à N plateaux, pas seulement domicile/extérieur.
--
-- Retour terrain de Robin : certains jeux opposent 3 équipes (ou plus) en même
-- temps sur le terrain, pas toujours 2. Le modèle home_squad_id/away_squad_id/
-- score_home/score_away de LOT C ne peut représenter qu'un affrontement à 2.
--
-- Remplacé par une table de participation training_game_squads (game_id,
-- squad_id, score), une ligne par équipe participant au jeu — un jeu à 2
-- équipes est simplement N=2, rien de spécial à coder pour ce cas.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. Nouvelle table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_game_squads (
  game_id    uuid NOT NULL REFERENCES public.training_games(id) ON DELETE CASCADE,
  squad_id   uuid NOT NULL REFERENCES public.training_squads(id) ON DELETE CASCADE,
  club_id    uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  score      smallint NOT NULL DEFAULT 0,
  sort_order smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, squad_id)
);

COMMENT ON TABLE public.training_game_squads IS
  'Une ligne par équipe participant à un jeu — remplace home_squad_id/away_squad_id/score_home/score_away, qui ne représentaient que 2 équipes. sort_order fixe l''ordre d''affichage sur l''écran de jeu.';

CREATE INDEX IF NOT EXISTS idx_training_game_squads_game_id ON public.training_game_squads (game_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. Backfill des jeux déjà créés sous l'ancien modèle (2 lignes par jeu),
-- puis suppression des colonnes devenues inutiles. Idempotent : ON CONFLICT
-- DO NOTHING pour un rejeu, DROP COLUMN IF EXISTS pour une base déjà migrée.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.training_game_squads (game_id, squad_id, club_id, score, sort_order)
SELECT id, home_squad_id, club_id, score_home, 0
FROM public.training_games
WHERE home_squad_id IS NOT NULL
ON CONFLICT (game_id, squad_id) DO NOTHING;

INSERT INTO public.training_game_squads (game_id, squad_id, club_id, score, sort_order)
SELECT id, away_squad_id, club_id, score_away, 1
FROM public.training_games
WHERE away_squad_id IS NOT NULL
ON CONFLICT (game_id, squad_id) DO NOTHING;

ALTER TABLE public.training_games DROP COLUMN IF EXISTS home_squad_id;
ALTER TABLE public.training_games DROP COLUMN IF EXISTS away_squad_id;
ALTER TABLE public.training_games DROP COLUMN IF EXISTS score_home;
ALTER TABLE public.training_games DROP COLUMN IF EXISTS score_away;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. club_id dérivé par trigger depuis game_id — même patron que
-- training_game_players_fill_club_id (20260923150000 §2).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.training_game_squads_fill_club_id()
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

DROP TRIGGER IF EXISTS training_game_squads_fill_club_id_trg ON public.training_game_squads;
CREATE TRIGGER training_game_squads_fill_club_id_trg
  BEFORE INSERT ON public.training_game_squads
  FOR EACH ROW EXECUTE FUNCTION public.training_game_squads_fill_club_id();

REVOKE ALL ON FUNCTION public.training_game_squads_fill_club_id() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Privilèges et RLS — lecture has_club_access, écriture has_club_write_access.
-- UPDATE nécessaire ici (contrairement à training_game_players, jamais mise à
-- jour) : le score de chaque équipe est réécrit à chaque tap.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.training_game_squads FROM PUBLIC;
REVOKE ALL ON TABLE public.training_game_squads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_game_squads TO authenticated;

ALTER TABLE public.training_game_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_game_squads_select ON public.training_game_squads FOR SELECT TO authenticated
  USING (public.has_club_access(club_id));
CREATE POLICY training_game_squads_insert ON public.training_game_squads FOR INSERT TO authenticated
  WITH CHECK (public.has_club_write_access((SELECT club_id FROM public.training_games WHERE id = game_id)));
CREATE POLICY training_game_squads_update ON public.training_game_squads FOR UPDATE TO authenticated
  USING      (public.has_club_write_access(club_id))
  WITH CHECK (public.has_club_write_access(club_id));
CREATE POLICY training_game_squads_delete ON public.training_game_squads FOR DELETE TO authenticated
  USING (public.has_club_write_access(club_id));

COMMIT;
