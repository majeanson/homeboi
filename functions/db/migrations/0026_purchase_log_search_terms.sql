-- The list is now one active list: a checked item stays put until "Clear checked"
-- deletes it AND logs the buy here. To re-add an item next week with the SAME
-- flyer-search synonyms it used to carry (list_items.search_terms is deleted with
-- the row), we stash those synonyms on the purchase row at clear time. The quick-
-- add panel reads the latest set per item back, so tapping "Pain" again restocks
-- "pain, baguette, bread" without retyping. A JSON array of strings, or null/none.
-- Additive, forward-only, filename-locked.
ALTER TABLE purchase_log ADD COLUMN search_terms TEXT;
