-- Ajoute 'assist' et conserve 'dribble' dans la contrainte CHECK de match_events

ALTER TABLE match_events
  DROP CONSTRAINT IF EXISTS match_events_event_type_check;

ALTER TABLE match_events
  ADD CONSTRAINT match_events_event_type_check CHECK (
    event_type IN (
      'goal', 'shot', 'shot_on_target', 'recovery',
      'yellow_card', 'red_card', 'dribble', 'assist', 'ball_loss',
      'opponent_goal', 'opponent_shot', 'opponent_shot_on_target'
    )
  );
