-- Household postal code (Canadian FSA+LDU). Used by the flyer/deal lookup
-- (/api/deals, /api/flyer) so the operator sets their location once instead of
-- typing it every shopping trip. Additive, forward-only, filename-locked.
-- Nullable: a household that never shops-by-flyer simply leaves it empty.
ALTER TABLE households ADD COLUMN postal_code TEXT;
