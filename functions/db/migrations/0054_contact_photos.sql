-- Per-person photo gallery for « Le cercle »: extra pictures attached to a contact,
-- each with a short caption — an ID card, a screenshot of a coworker, a snapshot
-- together, etc. Distinct from contacts.photo_key (the single avatar face). Blobs
-- ride R2 like every other image (uploaded via POST /api/cercle, image/*); a row
-- here just tracks {contact, key, caption}. Rows CASCADE when the contact or the
-- household is removed; the contact DELETE handler frees the R2 blobs first.
-- CALM: a small attachments list, never a feed — no counts, no ordering games.
CREATE TABLE IF NOT EXISTS contact_photos (
  id           TEXT     PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  household_id TEXT     NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  contact_id   TEXT     NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  photo_key    TEXT     NOT NULL,
  caption      TEXT,
  created_at   INTEGER  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contact_photos_contact   ON contact_photos(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_photos_household ON contact_photos(household_id);
