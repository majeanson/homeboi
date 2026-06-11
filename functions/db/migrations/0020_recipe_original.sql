-- The original recipe, as imported — BEFORE any edits, scaling or cleanup.
-- Additive, forward-only, filename-locked (never rename once applied).
-- A JSON object {title, ingredients, steps, servings?, source?, importedAt}
-- captured the moment an import (URL / paste / photo OCR) fills the form, so
-- the cook can always flip back to "the recipe as it came" no matter how much
-- the card was reworked afterwards. null = hand-typed recipe (no import).
ALTER TABLE recipes ADD COLUMN original_json TEXT;
