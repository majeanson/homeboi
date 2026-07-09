-- D-17 (bmad/10) — « La rentrée » is the first setting that doesn't deserve its own
-- `households` column: the DB-6 rule ("a 5th-plus new preference column widens the
-- tenant row too far") finally fires — `households` already carries ~15 pref columns
-- (postal_code, meal_slot_colours, reserve_locations, cars, aisle_order, wifi_ssid…).
-- A generic (household_id, key) keyed JSON store instead: each preference is its OWN
-- row, so unrelated settings never share a column and can't clobber each other on a
-- concurrent write. Starts with ONE key: `schoolYear` (school-year bounds + relâche
-- windows, see functions/_lib/schoolYear.ts); future household-wide settings that
-- don't fit the "one column" shape land here too, instead of growing `households`
-- further.
--
--   household_id: soft ref (no FK) — deleting a household never needs a cascade here
--                 (the row set is naturally orphaned, same as every other household-
--                 scoped table in this schema).
--   key:          the preference's name ('schoolYear', …) — PRIMARY KEY with
--                 household_id, so ONE row per household per key (upsert target).
--   value:        the preference's JSON payload. NOT NULL, defaults to an empty
--                 object per the schema convention (JSON columns never store a bare
--                 NULL a reader has to guard) — though in practice a row is only ever
--                 INSERTed once a household actually sets the key.
-- Additive, forward-only, filename-locked.
CREATE TABLE household_preferences (
  household_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, key)
);
