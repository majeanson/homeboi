-- Customizable recipe-tab "pills" config.
-- One ordered JSON array per household: which built-in filter/sort pills show and
-- in what order (each may be hidden), PLUS operator-defined custom pills (label +
-- colour + attribute rules over time / ingredients / servings / tag / favourite).
-- NULL = the built-in default set, all shown, default order. No new table — it's
-- per-household UI config, like meal_slot_colors / recipe_tag_colors_json.
ALTER TABLE households ADD COLUMN recipe_pills_json TEXT;
