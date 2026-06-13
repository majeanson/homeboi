-- AI error log — a small, household-scoped history of times a Workers AI call
-- failed (a retired model, an outage, a malformed reply). The capture/recipe/
-- recap helpers degrade gracefully so a failure never blocks the family, but it
-- used to vanish silently — once '@cf/meta/llama-3.1-8b-instruct' was retired
-- (2026-05-30) every AI feature broke for two weeks with nothing on screen.
--
-- Now a failure pops an on-screen notice; acknowledging it ("Accepter") writes a
-- row here, the operator reads the journal in Réglages, and clears it when done.
-- Not a metric, not a streak, nothing to optimize against (NFR-CALM): it's a
-- maintenance log that empties when you clear it. Additive, forward-only,
-- filename-locked.
CREATE TABLE ai_errors (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  feature       TEXT NOT NULL,   -- which endpoint/path failed (e.g. "suggest-meal")
  message       TEXT NOT NULL,   -- the model/runtime error message
  profile       TEXT REFERENCES members(id),  -- who was at the device, if picked
  created_at    INTEGER NOT NULL
);
CREATE INDEX ai_errors_household_recent ON ai_errors(household_id, created_at DESC);
