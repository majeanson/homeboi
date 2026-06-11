-- Fridge notes — short household notes that show on the Aujourd'hui board until
-- someone clears them. Until now a captured "note" (the AI router's catch-all,
-- e.g. "penser à appeler maman") only lived in the `captures` audit table and
-- was never seen. This gives notes a real home so they surface on the wall.
--
-- Additive, forward-only, filename-locked. A note is cleared (not deleted) so a
-- mis-clear could be recovered later if we ever add undo; `dismissed_at IS NULL`
-- is the live set. member_id attributes who left it (pick-your-face), nullable.
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  text          TEXT NOT NULL,
  member_id     TEXT REFERENCES members(id),
  created_at    INTEGER NOT NULL,
  dismissed_at  INTEGER
);
CREATE INDEX notes_household_idx ON notes(household_id, dismissed_at, created_at);
