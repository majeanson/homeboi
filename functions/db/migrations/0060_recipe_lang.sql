-- Per-recipe reading language (TTS hint). A recipe imported from an English site
-- carries English ingredient/step text; with no signal, on-device read-aloud
-- speaks it with the UI-language voice (English words in a French mouth). This
-- stores the recipe's OWN language ('fr' | 'en', null = follow the UI) so the cook
-- view + toddler tiles narrate it with the matching voice when one is installed.
-- Not a translation — just which voice reads the words as written.
ALTER TABLE recipes ADD COLUMN lang TEXT;
