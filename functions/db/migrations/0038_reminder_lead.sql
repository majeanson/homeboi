-- A calm "Bientôt" reminder: an event or chore can declare how far ahead it
-- should start drawing attention on the board / À venir. lead_seconds = the
-- window before the occurrence during which the board flags it `soon` (hour OR
-- day scale, e.g. 3*3600 or 2*86400). This NEVER hides anything and is NOT a push
-- notification (NFR-CALM-1) — it's purely additive emphasis while the moment nears.
-- NULL = no reminder (today's behaviour). Bounded to ≤ 7 days by the API.
--
-- Additive, forward-only, filename-locked.
ALTER TABLE events ADD COLUMN lead_seconds INTEGER;
ALTER TABLE tasks  ADD COLUMN lead_seconds INTEGER;
