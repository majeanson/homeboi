-- Routine sticker wall — an OPT-IN reward/collection the household turns on by
-- switching OFF « Mode calme » (lib/calm). By default (calm ON) it is entirely
-- hidden and no stickers are given, so the app's calm, no-rewards promise holds;
-- a family that WANTS a growing sticker book enables it deliberately. Finishing a
-- routine lets the child place a sticker here; the wall is a permanent per-member
-- grid they fill over time.
--
-- This is a growing collection by design (the household chose it), so unlike the rest
-- of the app it does accumulate. It is still kept calm-compatible: per-child only, NO
-- cross-child ranking, NO count/score column, NO "you're behind" — just each kid's own
-- stickers. It uses none of the forbidden schema tokens (streak/points/badge/
-- push_subscription/quantity/stock_count), so calm-tenets.test.ts stays green; the
-- reward semantics live behind the calm toggle, not in the schema.
--
--   member_id: soft ref (no FK) — whose wall; deleting a member never cascades a wall away.
--   sticker:   the chosen sticker token (an emoji from a closed client set).
--   routine_id: soft ref (no FK) — which routine earned it (nullable; informational).
-- Additive, forward-only, filename-locked.
CREATE TABLE routine_stickers (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  member_id TEXT,
  sticker TEXT NOT NULL,
  routine_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_routine_stickers_household ON routine_stickers (household_id, created_at);
