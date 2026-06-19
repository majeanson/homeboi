-- A lasting DRAWING COLLECTION / gallery (#14), separate from the transient fridge
-- notes that get cleared. Kept drawings live here — especially a toddler's growing
-- "Mes dessins" — each owning its own R2 blobs (PNG + editable scene) so a note
-- being cleared never frees a kept drawing. No counts/ranks (calm); just the works.
CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT,
  media_key TEXT NOT NULL,
  scene_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drawings_household ON drawings (household_id, created_at DESC);
