-- A planned meal can now point at a saved recipe instead of being matched by a
-- loose title. recipe_id is OPTIONAL: a slot still holds plain free text (a
-- "general idea" supper that isn't a saved recipe) when null. When set, the grid
-- opens the exact recipe (no fuzzy title lookup) and renames follow the link.
-- No foreign key on purpose — a recipe may be deleted after planning; the meal
-- keeps its title and the dangling id resolves to "no recipe" gracefully (same
-- link-by-id-only convention as last_done_by / suggested_by).
-- Additive, forward-only, filename-locked.
ALTER TABLE meals ADD COLUMN recipe_id TEXT;
