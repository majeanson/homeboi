-- Family-info intake forms. A relative opens a typed, time-boxed share link (the
-- new 'intake' GuestKind — see functions/_lib/auth.ts) and fills in their own card
-- and optionally their household + relationships. Each submission lands HERE as a
-- pending quarantine row — it NEVER touches the live cercle until the operator
-- reviews and merges it (functions/api/intake.ts + the ReviewChecklist flow). The
-- 'intake' link is the one guest kind allowed to write, and only to its single
-- submit endpoint (functions/api/guest/intake-submit.ts).
--
-- `payload` is opaque server-side: the JSON shape { self, household[], links[] }
-- is defined + validated in functions/_lib/intake.ts; the merge logic lives client-
-- side (it reuses the existing cercle POST endpoints), so the server just stores,
-- lists, and marks reviewed. Plain text, no count/quantity/score column — nothing
-- here trips the calm-tenets scan. Additive, forward-only, filename-locked.
CREATE TABLE intake_submissions (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  guest_id     TEXT NOT NULL,                   -- which link it arrived through
  target_key   TEXT,                            -- person a per-person link aimed at ('member:<id>'/'contact:<id>'); NULL = open link
  payload      TEXT NOT NULL,                   -- JSON { self, household[], links[] } (see _lib/intake.ts)
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | merged | dismissed
  created_at   INTEGER NOT NULL,
  reviewed_at  INTEGER
);

CREATE INDEX idx_intake_household ON intake_submissions(household_id, status);
