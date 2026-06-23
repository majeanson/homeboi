-- Staging bucket for photos a relative uploads through a family-info intake link
-- (the 'intake' GuestKind, migration 0075). A guest can't write to the cercle, so a
-- photo can't attach to a contact that doesn't exist yet: the blob goes to R2 and we
-- record the key HERE as 'staged'. When the operator reviews the form (Fiches reçues)
-- and merges it, the photo is RESOLVED onto the new/updated contact (or pet); on
-- dismiss the blob is freed. An opportunistic sweep (functions/api/intake.ts GET)
-- deletes staged rows whose blob is older than a link's max life and isn't referenced
-- by any pending submission — so an abandoned upload can't accumulate in R2.
--
-- Plain media bookkeeping — no count/quantity/score column; nothing trips the calm
-- scan. Additive, forward-only, filename-locked.
CREATE TABLE intake_media (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  guest_id     TEXT NOT NULL,                  -- which intake link uploaded it
  r2_key       TEXT NOT NULL,                  -- the object in the PHOTOS bucket (prefix ik_)
  status       TEXT NOT NULL DEFAULT 'staged', -- staged | resolved
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_intake_media_household ON intake_media(household_id, status);
