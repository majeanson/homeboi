-- « Laisse un mot » — the household's INTERNAL answering machine on the fridge. One member
-- leaves a short mot (a voice clip #38 / a drawing #14 / a photo #13 and/or a typed line)
-- ADDRESSED to ANOTHER member, or to the whole Maisonnée; it waits, unopened, until the
-- recipient picks their face and opens it.
-- DISTINCT from « La boîte aux lettres » (postbox = guest/outsider -> household moderation
-- queue) and from family_notes (durable directory notes) / board notes (shared fridge
-- memos): a mot is a one-to-one(-or-all) ADDRESSED message with an opened/unopened lifecycle.
--   member_id        = the RECIPIENT.  NULL = addressed to the whole Maisonnee.   (soft ref, no cascade)
--   author_member_id = the SENDER (pick-your-face).                                (soft ref, no cascade)
--   opened_at        = recipient first opened/played it; NULL = still waiting (drives the calm heads-up).
--   saved_at         = recipient chose to KEEP it (a keepsake); NULL = not kept.
-- Media trio reuses /api/note-media (nm_/ns_ keys), exactly like family_notes. Forward-only.
CREATE TABLE mots (
  id                TEXT PRIMARY KEY,
  household_id      TEXT NOT NULL REFERENCES households(id),
  member_id         TEXT REFERENCES members(id),   -- RECIPIENT; NULL = Maisonnee (everyone)
  author_member_id  TEXT REFERENCES members(id),   -- SENDER (pick-your-face)
  text              TEXT NOT NULL DEFAULT '',
  media_kind        TEXT,                           -- 'audio' | 'drawing' | 'image'
  media_key         TEXT,                           -- R2 object key (nm_…)
  scene_key         TEXT,                           -- editable drawing scene (ns_…), drawing only
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER,                        -- last edit of an unopened mot
  opened_at         INTEGER,                        -- recipient first opened it; NULL = still waiting
  saved_at          INTEGER,                        -- recipient kept it as a keepsake; NULL = not kept
  deleted_at        INTEGER                         -- soft delete; live set = NULL
);
-- Live per-recipient waiting lookup (presence card + per-face dot).
CREATE INDEX mots_household_idx
  ON mots(household_id, deleted_at, member_id, opened_at, created_at);
