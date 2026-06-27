-- « Le cercle » → Famille → "Notes & recommandations" gains an explicit, optional
-- TITLE (iOS-Notes style): a named note instead of deriving the heading from the body's
-- first line. The existing `text` column keeps the body, now stored as lightweight
-- Markdown (bold/italic/strike, headings, bullets/numbered/checklists, quote) — plain
-- text, so no schema change is needed for the rich formatting.
-- Additive, forward-only, filename-locked.
ALTER TABLE family_notes ADD COLUMN title TEXT NOT NULL DEFAULT '';
