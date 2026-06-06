-- Recurrence for events ("garbage every Wednesday", biweekly, monthly). A
-- recurring event stores its rule here as JSON ({freq, interval?, weekdays?});
-- start_at stays the ANCHOR (first occurrence + the time-of-day every occurrence
-- inherits). NULL = a one-off event, exactly as before. The board expands a
-- series into concrete days at read time, so a series is still one row.
-- See functions/_lib/recur.ts.
ALTER TABLE events ADD COLUMN recur_json TEXT;
