-- P2-4: unify the guest-submission media staging tables. `intake_media` (mig 0076)
-- and `postbox_media` (mig 0085) were byte-for-byte identical — same 6 columns, same
-- INSERT, same 7-day-orphan sweep, same resolve-delete — differing only in the table
-- name. Fold both into ONE `staged_media` with a `submission_kind` discriminator so the
-- write + sweep + delete live once (functions/_lib/stagedMedia.ts). The *submission*
-- tables (intake_submissions / postbox_submissions) stay separate — their payloads
-- genuinely differ; only this media-staging layer was duplicated.
--
-- No FK to the submission tables (a guest's blob must never cascade): the sweep
-- reconciles by age + an explicit referenced-key set, exactly as before. Backfill copies
-- both tables' rows (ids are random newId()s, so no PK collision) tagged by kind, then
-- drops the originals. Forward-only, filename-locked.
CREATE TABLE staged_media (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL,
  guest_id        TEXT NOT NULL, -- soft ref: which guest token staged it (no FK)
  submission_kind TEXT NOT NULL, -- 'intake' | 'postbox' — the kind discriminator
  media_key       TEXT NOT NULL, -- the R2 key of the staged blob
  status          TEXT NOT NULL DEFAULT 'staged',
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_staged_media_household ON staged_media (household_id, submission_kind, status);

INSERT INTO staged_media (id, household_id, guest_id, submission_kind, media_key, status, created_at)
  SELECT id, household_id, guest_id, 'intake', media_key, status, created_at FROM intake_media;
INSERT INTO staged_media (id, household_id, guest_id, submission_kind, media_key, status, created_at)
  SELECT id, household_id, guest_id, 'postbox', media_key, status, created_at FROM postbox_media;

DROP TABLE intake_media;
DROP TABLE postbox_media;
