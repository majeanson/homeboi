-- Per-item grocery AISLE OVERRIDES (phase 2 of the aisle sort), household-level. A
-- JSON map { normalizedItemKey: aisleId } correcting the keyword classifier when it
-- mis-buckets an item ("granola" → snacks, not produce). Keyed by the same
-- accent/quantity-insensitive item key as the ghost/purchase log, so the correction
-- survives clearing the line and re-adding it. Set in the list item's edit sheet,
-- read by La liste's "Par allée" sort. Still grouping/ordering only — never a count
-- (calm). Nullable/absent = no overrides. Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN aisle_overrides TEXT;
