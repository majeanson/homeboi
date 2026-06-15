-- "Restants" (leftovers) — announce that a meal we ate has extra, then either
-- plan it onto a day OR drop it into an "à finir bientôt" pool when no day is
-- chosen. Two shapes, mirroring the proven meal_ideas pattern (0025):
--
--   • A PLANNED leftover is a normal meals row tagged is_leftover = 1 — it shows
--     as that day's meal everywhere meals already render (board, grid, month),
--     for free, but carries a "Restants" badge so it reads as a leftover.
--   • An UNDATED leftover lives in meal_leftovers (it can't live in meals, whose
--     date is NOT NULL). It surfaces as a calm "eat these first" reminder on the
--     board + kitchen and, like pantry_use_soon, does NOT touch the shopping list.
--
-- Calm tenet (NFR-CALM-1): NO quantity/count — a leftover is just a dish name and
-- an optional day, never an inventory. Additive, forward-only, filename-locked.

ALTER TABLE meals ADD COLUMN is_leftover INTEGER NOT NULL DEFAULT 0;

CREATE TABLE meal_leftovers (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL REFERENCES households(id),
  title          TEXT NOT NULL,
  recipe_id      TEXT,            -- optional: the saved recipe this dish came from (not a FK)
  source_meal_id TEXT,           -- optional: the meal it was left over from, for provenance (not a FK)
  created_at     INTEGER NOT NULL
);
CREATE INDEX meal_leftovers_household_idx ON meal_leftovers(household_id, created_at);
