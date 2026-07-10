-- Extend the `is_sample` demo-data flag (migrations 0096/0097) to four more tables
-- so the onboarding/demo seed can populate every board card: « À finir » (undated
-- leftovers), « L'auto » (a work schedule window), « Mes habitudes » (habits), and
-- « Notes (cercle) » (family notes). Without the flag, « Vider les exemples » could
-- not tell a seeded row from one the operator added, so these entities were left out
-- of the seed and their cards showed empty in the demo.
--
-- `habit_days` (a habit's per-day history) is deliberately NOT flagged: it has no
-- household_id column, so the household-scoped sample sweep can't target it — and the
-- seed doesn't create any (an un-touched habit reads as a neutral, un-checked today,
-- which is exactly the calm default). Additive, forward-only, filename-locked.
ALTER TABLE meal_leftovers ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedule_blocks ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE family_notes ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
