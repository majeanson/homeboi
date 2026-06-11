-- The "general ideas" pool: meal ideas that aren't pinned to a day/slot yet — a
-- reusable shortlist the household builds up ("tacos", "soupe poulet-nouilles",
-- or a saved recipe). Generalizes today's toddler "suggest a meal" mechanism: a
-- suggestion can land here for anyone to plan onto a real day, instead of only
-- going straight into an empty slot.
--
-- An idea is either free text (title only) OR a recipe shortcut (recipe_id set,
-- title kept as a label). suggested_by records who added it (a child's pick, an
-- AI suggestion kept by a parent). Planning an idea onto a day writes a meals row
-- and LEAVES the idea in the pool — ideas are reusable, not consumed.
-- Additive, forward-only, filename-locked.
CREATE TABLE meal_ideas (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  recipe_id     TEXT,              -- optional: the saved recipe this idea links to
  suggested_by  TEXT,              -- optional: member id who added it
  created_at    INTEGER NOT NULL
);
CREATE INDEX meal_ideas_household_idx ON meal_ideas(household_id, created_at);
