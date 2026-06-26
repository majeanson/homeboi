-- DB-2 (UNIFORMIZING Phase 2): one spelling for colour. The app already leans
-- `colour` (members/businesses/pets/contact_groups); these were the `color` outliers.
-- Forward-only; one-row-per-table at a single household. Readers updated in the same
-- commit; SQL SELECTs alias `colour AS color` (and the household JSON columns back to
-- their old names) so every row interface + API JSON key stays byte-identical — no
-- frontend churn. None of these columns sit in an index.
ALTER TABLE tasks           RENAME COLUMN color TO colour;
ALTER TABLE home_projects   RENAME COLUMN color TO colour;
ALTER TABLE schedule_blocks RENAME COLUMN color TO colour;
ALTER TABLE carnets         RENAME COLUMN color TO colour;
-- Household colour-preference JSON columns (plural compound names).
ALTER TABLE households      RENAME COLUMN meal_slot_colors       TO meal_slot_colours;
ALTER TABLE households      RENAME COLUMN recipe_tag_colors_json TO recipe_tag_colours_json;
ALTER TABLE households      RENAME COLUMN measure_colors         TO measure_colours;
