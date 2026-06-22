-- « L'auto » horaires gain recurrence beyond plain weekly (#28). Until now a
-- schedule_block repeated EVERY week on its weekdays; a shift worker on an
-- alternating-week rota ("every other Saturday") couldn't be expressed.
--
-- week_interval: repeat every N weeks. 1 = every week (the existing behaviour, and
--   the DEFAULT so every pre-0073 block keeps repeating weekly untouched).
-- anchor_day: local-midnight unix-seconds of a reference week the interval phases
--   from — which fortnight is "on". NULL for weekly blocks (interval 1), where it's
--   irrelevant; the server stamps the current local week's start when a block is
--   saved with interval > 1. The carResolve engine reads both to decide whether a
--   given local week is active (same week-bucket math _lib/recur uses for events).
ALTER TABLE schedule_blocks ADD COLUMN week_interval INTEGER NOT NULL DEFAULT 1;
ALTER TABLE schedule_blocks ADD COLUMN anchor_day INTEGER;
