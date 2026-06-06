-- Photos: family pictures for the wall-board frame, and a colour split so a
-- member can have a PHOTO face while still owning a tint colour.
--
-- The image bytes live in R2 (free tier, no egress); these rows are just the
-- index. The API caps the count and prunes the oldest, so storage never grows
-- unbounded — the brief's "never pay" constraint, enforced structurally.

CREATE TABLE photos (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  r2_key       TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX photos_household_idx ON photos(household_id, created_at DESC);

-- Until now avatar_ref doubled as the member's colour (avatar_kind='color'). To
-- support a photo avatar (avatar_kind='photo', avatar_ref=r2 key) WITHOUT losing
-- the colour used for board tinting (event spines, "pick your face"), split the
-- colour into its own column and backfill it from the existing value.
ALTER TABLE members ADD COLUMN colour TEXT NOT NULL DEFAULT '#7a8b6f';
UPDATE members SET colour = avatar_ref WHERE avatar_kind = 'color';
