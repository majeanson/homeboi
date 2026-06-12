-- Real prep/cook/total times (whole minutes) + the yield's unit word for
-- recipes. Imports used to flatten times into the notes text ("Préparation
-- 20 min · …") — real columns make them editable fields, show time pills on
-- the cards, and allow a "30 min or less" filter. servings_unit keeps a yield
-- like "24 biscuits" honest instead of relabelling it "24 portions"; null =
-- plain servings. All nullable: a hand-typed recipe simply has none.
-- Additive, forward-only, filename-locked.
ALTER TABLE recipes ADD COLUMN prep_min INTEGER;
ALTER TABLE recipes ADD COLUMN cook_min INTEGER;
ALTER TABLE recipes ADD COLUMN total_min INTEGER;
ALTER TABLE recipes ADD COLUMN servings_unit TEXT;
