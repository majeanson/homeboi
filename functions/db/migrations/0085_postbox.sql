-- « La boîte aux lettres » (#postbox) — a SECOND writable guest kind (after intake).
-- A relative opens a time-boxed link, names themselves, and leaves a message — a
-- word, a voice clip, a drawing, or a photo. It lands QUARANTINED here; the operator
-- reviews it in Réglages ▸ Partage and, on accept, it becomes a board fridge note
-- (notes table) attributed to the sender. Mirrors the intake quarantine (0075/0076)
-- but the payload is a single memo, so one flat table + a media-staging table.
--
-- Calm: no counts/streaks/quantity columns (calm-tenets.test.ts stays green).

CREATE TABLE postbox_submissions (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  guest_id     TEXT NOT NULL,
  sender_name  TEXT,
  text         TEXT,
  media_kind   TEXT,    -- 'audio' | 'drawing' | 'image' | NULL
  media_key    TEXT,    -- staged R2 key (pm_…)
  scene_key    TEXT,    -- editable drawing scene (ps_…), drawings only
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | dismissed
  created_at   INTEGER NOT NULL,
  reviewed_at  INTEGER
);

CREATE INDEX idx_postbox_pending ON postbox_submissions (household_id, status, created_at);

-- Staged media for a not-yet-accepted message — so an abandoned upload (the sender
-- uploaded, then never sent) is sweepable. Mirrors intake_media (migration 0076).
CREATE TABLE postbox_media (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  guest_id     TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'staged',  -- staged | resolved
  created_at   INTEGER NOT NULL
);

-- Attribution on a board note: who left it (« — Papi »). Set by the postbox accept
-- to name a message's sender; NULL for ordinary household notes.
ALTER TABLE notes ADD COLUMN author_label TEXT;
