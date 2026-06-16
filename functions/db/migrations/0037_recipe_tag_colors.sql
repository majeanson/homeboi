-- Per-tag recipe colours, household-level (shared across the wall tablet and every
-- phone, so a tag reads the same colour everywhere it shows — recipe view, search
-- pills, the form). JSON object {lowercase tag name: "#rrggbb"} overriding the
-- default berry chip for that tag anywhere it renders. A missing key = the built-in
-- chip colour, so this is purely additive: no recipe backfill, untagged-or-uncoloured
-- recipes look exactly as before. Keyed by lowercase name to match the case-insensitive
-- tag convention used throughout recipe-tags.ts (rename/remove move/drop the key).
-- Default '{}' = no overrides. Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN recipe_tag_colors_json TEXT NOT NULL DEFAULT '{}';
