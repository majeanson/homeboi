-- Standing/recurring list staples (#27). A "standing" ghost_item is a household
-- staple the operator has pinned as ALWAYS wanted on the grocery list (milk,
-- bread, eggs). Distinct from the predictive ghost: it isn't cadence-guessed and
-- it never auto-adds (the list still empties and stays empty — NFR-CALM). Instead
-- it's surfaced deterministically at the top of the Quick-add "Toujours" group so
-- a one-tap restock never forgets it. Reuses ghost_items rather than a parallel
-- table; a code-staple becomes standing the moment it's pinned (an override row).
ALTER TABLE ghost_items ADD COLUMN standing INTEGER NOT NULL DEFAULT 0;
