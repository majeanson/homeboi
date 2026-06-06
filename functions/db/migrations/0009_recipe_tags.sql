-- Recipe tags: a small set of free labels per recipe ("rapide", "végé",
-- "préféré"…) powering the Kitchen filter chips. Additive, forward-only,
-- filename-locked (never rename once applied). Stored as a JSON array of strings
-- — same convention as ingredients_json/steps_json. Default '[]' so every
-- existing recipe reads as untagged with no backfill.
ALTER TABLE recipes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
