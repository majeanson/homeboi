-- Stores whose deals are kept everywhere (browsable, stageable, on the price-match
-- proof) but deliberately HIDDEN in "Montrer à la caisse" (the till stepper) — the
-- stores you physically shop at, where showing their own flyer to the cashier is
-- pointless. JSON array of normalized merchant keys (trimmed + lowercased), the
-- same identity form as `included_stores`. Nullable/empty = nothing hidden at the
-- till. Independent of `included_stores`: a store excluded from search never reaches
-- the cashier anyway, so this only matters for stores you DO include.
-- Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN cashier_excluded_stores TEXT;
