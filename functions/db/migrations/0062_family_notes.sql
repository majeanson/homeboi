-- « Le cercle » → Famille → "Notes & recommandations". iOS-Notes-style quick notes
-- scoped to one household member (personal) or the whole Maisonnée (family-wide),
-- with optional media (audio memo / drawing / shared photo) reusing /api/note-media.
-- SEPARATE from the board `notes` table on purpose: those are transient fridge
-- memos shown on Aujourd'hui until cleared; these are durable directory notes that
-- live under the Famille tab and never touch the board.
--
-- Scope: member_id = a member's id  -> a PERSONAL note for that member (the "Moi" list);
--        member_id = NULL           -> a MAISONNÉE (family-wide) note.
-- author_member_id attributes who WROTE it (pick-your-face), independent of scope,
-- so a card can tint by author like a fridge note.
-- Additive, forward-only, filename-locked.
CREATE TABLE family_notes (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  member_id         TEXT REFERENCES members(id),   -- scope: NULL = Maisonnée
  author_member_id  TEXT REFERENCES members(id),   -- attribution: who wrote it
  text              TEXT NOT NULL DEFAULT '',
  media_kind        TEXT,                           -- 'audio' | 'drawing' | 'image'
  media_key         TEXT,                           -- R2 object key
  scene_key         TEXT,                           -- editable drawing scene (#1)
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER,
  deleted_at        INTEGER                         -- soft delete; live set = NULL
);
CREATE INDEX family_notes_household_idx
  ON family_notes(household_id, deleted_at, member_id, created_at);
