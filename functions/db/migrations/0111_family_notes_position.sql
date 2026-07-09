-- « Le cercle » → Notes: manual ordering. The notes list (Le cercle ▸ Notes and the
-- board's « Notes (cercle) » card) becomes drag-reorderable, so rows need a stored
-- order. Mirrors trip_notes: every existing row keeps position 0 (the pre-reorder
-- state) and the reader ORDERs BY position, created_at DESC — so nothing moves until
-- the first drag renumbers the displayed list 0..n-1 (one position PATCH per moved
-- row, skipping rows already at their index).
ALTER TABLE family_notes ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
