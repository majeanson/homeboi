-- A recurring chore can now begin on a CHOSEN date, not just "whenever I added
-- it". Until now created_at was the recurrence anchor (0019), so "every 2 weeks"
-- silently meant "every 2 weeks counting from today" — the interval had no real
-- meaning. recur_start lets the operator pick the anchor: unix-seconds at the
-- UTC-midnight of the chosen day (same day math as functions/_lib/recur).
-- NULL = fall back to created_at, so existing chores keep their old anchor.
--
-- Additive, forward-only, filename-locked.
ALTER TABLE tasks ADD COLUMN recur_start INTEGER;
