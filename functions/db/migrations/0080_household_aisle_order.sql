-- User-defined grocery AISLE ORDER for the shared list, household-level (shared
-- across the wall tablet + every phone). A JSON array of aisle ids
-- (["produce","bakery","meat",...]) giving the order to walk the store; the list
-- view's "Par allée" sort ranks items by it (see src/lib/aisle.ts). Items are
-- classified by REUSING the row-picture keywords (pictoFor), never counted —
-- grouping + ordering only, so the calm no-inventory tenet holds. Nullable/absent =
-- the built-in default order. Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN aisle_order TEXT;
