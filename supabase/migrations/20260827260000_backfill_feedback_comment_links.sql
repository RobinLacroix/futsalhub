-- Rattrapage ponctuel demandé par Robin : un commentaire de questionnaire de
-- match soumis AVANT 20260827230000 (le fix qui a ajouté player_events.
-- training_id/match_id) reste orphelin (les deux colonnes NULL) et ne se
-- raccroche à rien via l'ancienne heuristique par date si le questionnaire a
-- été rempli un autre jour que le match.
--
-- Rattachement rétroactif fiable : `submit_training_feedback` insère la ligne
-- `training_player_feedback` PUIS la ligne `player_events` (commentaire) dans
-- le MÊME appel de fonction, donc la MÊME transaction — `NOW()` y renvoie une
-- valeur strictement identique pour les deux INSERT (comportement standard de
-- Postgres : NOW() est figée au début de la transaction, pas ré-évaluée entre
-- deux instructions). `player_events.created_at` (défaut NOW(), jamais
-- écrasé) et `training_player_feedback.updated_at` (explicitement NOW()) sont
-- donc EXACTEMENT égaux pour un commentaire et sa soumission d'origine.
--
-- On ne rattache que quand ce couple (player_id, timestamp) désigne une seule
-- ligne `training_player_feedback` sans ambiguïté — sinon on laisse orphelin
-- plutôt que de deviner.

UPDATE public.player_events pe
SET training_id = f.training_id,
    match_id    = f.match_id
FROM public.training_player_feedback f
WHERE pe.event_type = 'feedback'
  AND pe.training_id IS NULL
  AND pe.match_id IS NULL
  AND pe.player_id = f.player_id
  AND pe.created_at = f.updated_at
  AND (
    SELECT COUNT(*) FROM public.training_player_feedback f2
    WHERE f2.player_id = pe.player_id AND f2.updated_at = pe.created_at
  ) = 1;

-- ── Bilan (informatif, pas bloquant : un reliquat orphelin n'est pas une
--    anomalie, juste un commentaire trop ancien pour avoir cette trace) ──────
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.player_events
  WHERE event_type = 'feedback' AND training_id IS NULL AND match_id IS NULL;

  RAISE NOTICE 'Backfill commentaires feedback : % ligne(s) encore orpheline(s) (non rattachable sans ambiguïté).', v_remaining;
END;
$$;
