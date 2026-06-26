-- DB-1 (UNIFORMIZING Phase 2): name every single-key blob column `media_key`, the
-- convention the trio-bearing tables (notes/family_notes/drawings/carnets/postbox
-- _submissions) already use. These seven held an R2 object key under the legacy names
-- `r2_key` / `photo_key`. Forward-only; one-row-per-table at a single household.
-- Readers updated in the same commit; SELECTs alias `media_key AS <old>` so every row
-- interface stays byte-identical (the API already maps these to camelCase, so no
-- frontend churn). NOT touched: the recipes/routines parallel-array media columns
-- (steps_images_json, cards_*_json) — normalizing those is out of scope (roadmap),
-- and `recipes.image` keeps its name (it holds a key OR a full https:// URL, so
-- `media_key` would mislead). None of these columns sit in an index.
ALTER TABLE photos         RENAME COLUMN r2_key    TO media_key;
ALTER TABLE contacts       RENAME COLUMN photo_key TO media_key;
ALTER TABLE contact_photos RENAME COLUMN photo_key TO media_key;
ALTER TABLE businesses     RENAME COLUMN photo_key TO media_key;
ALTER TABLE pets           RENAME COLUMN photo_key TO media_key;
ALTER TABLE intake_media   RENAME COLUMN r2_key    TO media_key;
ALTER TABLE postbox_media  RENAME COLUMN r2_key    TO media_key;
