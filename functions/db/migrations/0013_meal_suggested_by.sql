-- Kid-mode meal picks are SUGGESTIONS, not decisions: they only fill an empty
-- supper slot and never replace a planned meal. This records WHICH child suggested
-- it (member id), so a parent sees "suggéré par Léa" and can keep or change it.
-- Nullable; cleared automatically when a parent sets the meal (a fresh insert).
-- Additive, forward-only, filename-locked.
ALTER TABLE meals ADD COLUMN suggested_by TEXT;
