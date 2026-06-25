-- Hand drag-and-drop order for the ONE shared list (La liste). Until now rows
-- ordered by created_at (newest last); dragging to reorder needs a stable, explicit
-- slot. NULL = never hand-placed → still falls back to created_at, so existing rows
-- and freshly added items keep the old "newest last" behaviour until first dragged.
-- A reorder writes position 0..n across the visible set, making it authoritative.
ALTER TABLE list_items ADD COLUMN position INTEGER;
CREATE INDEX list_items_position_idx ON list_items(household_id, position);
