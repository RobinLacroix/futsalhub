-- Security fix: Remove anon access from get_coach_calendar_data
-- This RPC was incorrectly granted to anon, allowing unauthenticated
-- enumeration of all team schedules, matches, and trainings.
-- Coaches are always authenticated; anon access is not needed.
REVOKE EXECUTE ON FUNCTION get_coach_calendar_data(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION get_coach_calendar_data(UUID) FROM PUBLIC;

-- Note: get_feedback_session_by_token and submit_training_feedback are
-- intentionally accessible to anon (players follow a link without logging in).
-- Those tokens are gen_random_uuid() = 128-bit entropy, brute-force infeasible.
