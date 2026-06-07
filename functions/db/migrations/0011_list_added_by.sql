-- Pick-your-face attribution for the shared list: who added each item. Nullable
-- (items added from a kiosk, a recipe, or before this feature have no face) and
-- intentionally NOT a foreign key — it's a soft attribution tag, not a relation;
-- if a member is later removed the row simply shows no face. Additive,
-- forward-only, filename-locked.
ALTER TABLE list_items ADD COLUMN added_by TEXT;
