-- A grocery line can carry extra search synonyms for the flyer-deal lookup: the
-- item reads "Œuf" but the household wants the deals search to also try "œufs",
-- "oeuf", "egg", "eggs". Stored as a JSON array of strings (null = none). The
-- deals endpoint fans these out across Flipp and merges the results.
-- Additive, forward-only, filename-locked.
ALTER TABLE list_items ADD COLUMN search_terms TEXT;
