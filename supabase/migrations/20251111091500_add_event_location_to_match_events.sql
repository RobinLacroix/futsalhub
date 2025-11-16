-- Add optional location coordinates to match_events
ALTER TABLE match_events
ADD COLUMN IF NOT EXISTS location_x double precision,
ADD COLUMN IF NOT EXISTS location_y double precision;

-- Optional: constrain values between 0 and 1 if you plan to store normalized coords
ALTER TABLE match_events
ADD CONSTRAINT match_events_location_bounds
CHECK (
  (location_x IS NULL OR (location_x >= 0 AND location_x <= 1)) AND
  (location_y IS NULL OR (location_y >= 0 AND location_y <= 1))
);


