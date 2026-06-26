-- DB-3 (UNIFORMIZING Phase 2): standardize ordering columns on the convention name
-- `position`. The legacy outliers were members.sort_order, contact_groups.sort_order,
-- carnets.sort and home_pins.sort — every ordering column added since (meals, todos,
-- list_items) already uses `position`. Forward-only; with a single real household this
-- is a zero-risk one-row-per-table rename. Readers are updated in the same commit, and
-- the API JSON shapes are preserved (members SELECT aliases `position AS sort_order`;
-- carnets/home_pins keep their `sort` JSON field, mapped from the renamed column).
-- SQLite ≥3.25 RENAME COLUMN; D1 supports it. None of these columns sit in an index.
ALTER TABLE members        RENAME COLUMN sort_order TO position;
ALTER TABLE contact_groups RENAME COLUMN sort_order TO position;
ALTER TABLE carnets        RENAME COLUMN sort       TO position;
ALTER TABLE home_pins      RENAME COLUMN sort       TO position;
