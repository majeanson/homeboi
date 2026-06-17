-- Family "favorites" hearts (#21). A household member can ❤ a recipe; suggest-meal
-- then leans toward loved recipes. A PREFERENCE SIGNAL, never a score: the UI shows
-- WHICH faces loved a dish, never a count or rank (calm — same rule as the chore
-- ledger). One row per (recipe, member); re-loving is idempotent (INSERT OR IGNORE
-- on the PK). A planned meal shows its linked recipe's hearts. Forward-only, additive.
CREATE TABLE recipe_loves (
  household_id  TEXT NOT NULL REFERENCES households(id),
  recipe_id     TEXT NOT NULL REFERENCES recipes(id),
  member_id     TEXT NOT NULL REFERENCES members(id),
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, member_id)
);
CREATE INDEX recipe_loves_household_idx ON recipe_loves(household_id, recipe_id);
