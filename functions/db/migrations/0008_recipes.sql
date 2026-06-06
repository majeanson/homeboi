-- Recipe book. Additive, forward-only, filename-locked (never rename once
-- applied). A recipe is a household-owned card: a title, an ordered list of
-- ingredient lines, and ordered prep steps — both stored as JSON arrays of
-- strings (same shape convention as routines.cards_json). servings/notes/source
-- are optional grace notes for the cook.
--
-- This is the "consultation + meal-planning helper" layer: the Kitchen lists
-- recipes, a recipe can push its ingredients onto the shared list (source
-- 'recipe'), and planning a supper can pick a recipe (its title fills the slot,
-- its ingredients become the staple-confirm chips — no AI call needed then).
--
-- Deliberately NOT linked to the meals table by a foreign key: a planned supper
-- stays a free-text title (a recipe might be edited or deleted after planning,
-- and not every supper is a saved recipe). The recipe only SEEDS the meal.

CREATE TABLE recipes (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL REFERENCES households(id),
  title           TEXT NOT NULL,
  ingredients_json TEXT NOT NULL DEFAULT '[]', -- string[] of ingredient lines
  steps_json      TEXT NOT NULL DEFAULT '[]',  -- string[] of prep steps
  servings        INTEGER,                     -- optional, null = unspecified
  notes           TEXT,                        -- optional free text
  source          TEXT,                        -- optional: where it came from (url/book/"ai")
  -- A picture for the card. Holds EITHER an R2 key (a user-uploaded photo, like
  -- photos.r2_key — served via /api/img/<key>) OR a full https:// URL (the image
  -- pulled from an imported recipe page). The client renders an http(s) value
  -- directly and treats anything else as an R2 key. null = no picture.
  image           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX recipes_household_idx ON recipes(household_id, title);
