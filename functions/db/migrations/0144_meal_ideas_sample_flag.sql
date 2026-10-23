-- Extend the `is_sample` demo-data flag (migrations 0096/0097/0114/0117) to meal_ideas,
-- so the demo household can seed a couple of « Idées de repas » — an empty pool on an
-- otherwise full trial household read as a feature that does nothing — and
-- « Vider les exemples » / the 24 h reseed still removes only the demo rows.
-- Same pattern as 0117: default 0, no backfill needed.
ALTER TABLE meal_ideas ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
