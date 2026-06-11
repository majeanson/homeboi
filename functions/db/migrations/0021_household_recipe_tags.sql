-- Household-level recipe tag PRESETS: the pills offered when tagging a recipe,
-- editable in Réglages (so "Collation" never has to be retyped). Additive,
-- forward-only, filename-locked. JSON array of strings, same convention as
-- recipes.tags_json. Default '[]' = the UI falls back to its built-in starter
-- pills; once the household saves its own list, that list is the offer.
ALTER TABLE households ADD COLUMN recipe_tags_json TEXT NOT NULL DEFAULT '[]';
