-- ═════════════════════════════════════════════════════════════════════════════
-- Mode Séance Live : valeur du point par tap.
--
-- Retour terrain de Robin : le tap du jeu en cours doit pouvoir refléter le
-- système de points du procédé joué (ex: "un but = 3pts"), sans pour autant
-- réintroduire la ventilation par unité de score exclue le 13/08 (LOT C §5.2).
-- Un seul tap reste un seul point marqué — sa valeur se règle une fois, au
-- lancement du jeu, plutôt qu'un bouton par règle de score.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.training_games
  ADD COLUMN IF NOT EXISTS points_per_tap smallint NOT NULL DEFAULT 1;

ALTER TABLE public.training_games
  ADD CONSTRAINT training_games_points_per_tap_positive CHECK (points_per_tap > 0);

COMMENT ON COLUMN public.training_games.points_per_tap IS
  'Valeur ajoutée au score à chaque tap — 1 par défaut, réglable au lancement du jeu pour refléter le système de points du procédé (ex: 3 si "but = 3pts" dans training_procedures.scoring). Fixe pour toute la durée du jeu, jamais changée en cours de partie.';

COMMIT;
