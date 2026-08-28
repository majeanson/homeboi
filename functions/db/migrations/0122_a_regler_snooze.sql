-- « Plus tard » on an « À régler » signal.
--
-- The friction scan is DERIVED — functions/api/a-regler.ts reads existing tables
-- and returns signals, it owns no rows — so an acknowledgement has nowhere to
-- live on the thing itself. That's why this is a table rather than a column: the
-- shape home_projects.snoozed_until (0120) uses can't apply when there is no row
-- to hang it off.
--
-- Why it was needed: an unresolvable friction re-nagged on every single scan. A
-- ride whose driver genuinely isn't settled yet, a birthday you've decided not to
-- buy for — the card had no way to say "seen, not now", so the one surface meant
-- to REDUCE mental load kept spending it. Nothing here creates a backlog: the row
-- expires by itself and the signal simply returns.
--
-- `key` is the signal's own stable key (kind + entity), so a snooze follows the
-- friction, not its position in the list. `until` is a local-midnight unix sec —
-- the day it wakes back up. Expired rows are pruned opportunistically on read, so
-- the table stays a handful of rows, never a history.
CREATE TABLE IF NOT EXISTS a_regler_snoozes (
  household_id TEXT NOT NULL,
  key TEXT NOT NULL,
  until INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, key)
);
