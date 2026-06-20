-- Birthday gift/idea notes per « Le cercle » contact (#20). A freeform place to
-- jot what to get someone — "vélo, casque, livre de Mario" — that quietly surfaces
-- next to their birthday as it approaches, so the idea you had in March isn't lost
-- by the time the day comes. Per-person freeform text, distinct from the general
-- `notes` field. Calm: a memory aid, never a wishlist/registry with prices/counts.
ALTER TABLE contacts ADD COLUMN gift_ideas TEXT;
