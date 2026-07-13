-- Ajout du type 'substitution' dans la contrainte CHECK de match_events.event_type.
-- player_id = joueur sortant, players_on_field = compo après le changement (joueur entrant inclus).

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'match_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%event_type%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE match_events DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- NOT VALID : s'applique aux nouvelles lignes uniquement, évite l'échec sur données historiques.
ALTER TABLE match_events
  ADD CONSTRAINT match_events_event_type_check
  CHECK (event_type IN (
    'goal', 'shot', 'shot_on_target', 'recovery',
    'yellow_card', 'red_card', 'assist', 'ball_loss',
    'opponent_goal', 'opponent_shot', 'opponent_shot_on_target',
    'substitution'
  )) NOT VALID;
