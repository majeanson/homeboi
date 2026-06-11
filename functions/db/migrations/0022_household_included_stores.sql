-- The stores the operator chose to consider in the flyer/deal lookups (/api/deals,
-- /api/flyers) — an allowlist. JSON array of normalized merchant keys (trimmed +
-- lowercased) so "Super C" and "super c" collapse to one identity, matching Flipp's
-- flyer dedup. Only included stores reach the deal cards, the store picker, and the
-- price-match proof; every other store is dropped server-side. Nullable/empty = no
-- filter set yet, so every store is considered (and any new store the feed turns up
-- shows automatically until the operator narrows the list).
-- Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN included_stores TEXT;
