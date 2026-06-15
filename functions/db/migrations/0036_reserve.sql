-- La réserve — the "what's stashed behind everything" reminder. The garde-manger
-- already tracks what you're OUT of (pantry_low) and what to finish soon
-- (pantry_use_soon); neither answers "what do we actually have buried in the
-- freezer / back of the pantry that we keep forgetting". This is that list:
-- a small reminder of stored items, GROUPED BY a storage location.
--   reserve_locations: household-level JSON array of {id, name, color?} — the
--     storage spots, custom & editable in Réglages. Seeded client-side with two
--     defaults (Garde-manger, Congélateur) when NULL; an explicit array (incl.
--     "[]" = removed them all) is the household's own choice.
--   pantry_reserve: the stored items. Same minimal shape as pantry_use_soon plus
--     a soft location_id (a ref into reserve_locations; NULL / unknown = "Autres").
-- Deliberately NO quantity/count column — this is a reminder, not an inventory
-- (brief tenet 3; the calm-tenets test enforces it). Additive, forward-only,
-- filename-locked.
ALTER TABLE households ADD COLUMN reserve_locations TEXT;

CREATE TABLE pantry_reserve (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  item         TEXT NOT NULL,
  location_id  TEXT,
  marked_at    INTEGER NOT NULL
);
CREATE INDEX pantry_reserve_hh_idx ON pantry_reserve(household_id, marked_at);
