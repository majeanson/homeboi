-- Per-slot meal customization, household-level (shared across the wall tablet and
-- every phone, so a meal reads the same colour everywhere). Two settings:
--   meal_slot_colors: JSON object {slot: "#rrggbb"} overriding the default colour
--     for déjeuner/dîner/collation/souper anywhere a meal of that slot is shown
--     (board cards, month dots, kitchen). Missing slot = its built-in default.
--   meal_slot_hidden: JSON array of slot names to HIDE from the glance/plan
--     displays ("I only care about souper"). Empty/absent = show every slot.
-- Both nullable; absence means defaults (per-slot colours, all slots shown).
-- Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN meal_slot_colors TEXT;
ALTER TABLE households ADD COLUMN meal_slot_hidden TEXT;
