-- "À utiliser bientôt" — a light list of things you HAVE and want to finish
-- before they spoil (the complement of pantry_low, which is what you're OUT of).
-- Same minimal shape as pantry_low: an item label + when it was marked. It is NOT
-- a full inventory (brief tenet 3) and it does NOT touch the shopping list —
-- it only feeds recipe suggestions ("uses what you want to use up"). Additive,
-- forward-only, filename-locked.
CREATE TABLE pantry_use_soon (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  item         TEXT NOT NULL,
  marked_at    INTEGER NOT NULL
);
CREATE INDEX pantry_use_soon_hh_idx ON pantry_use_soon(household_id, marked_at);
