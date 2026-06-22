-- Home projects & maintenance — "Projets & Entretien", the longer-horizon home
-- work that lives under Corvées but isn't a chore. ONE table, a `kind` flag
-- discriminates the two faces:
--   'plan'   — an aspirational home plan (budget a new kitchen, finish the
--              basement). Often money-driven + one-off; usually undated (quiet,
--              Réglages-only) but may carry a target date.
--   'upkeep' — recurring maintenance (furnace filter every 3 mo, gutters 2x/yr,
--              check trees yearly). Surfaces on the board/month/day like a chore.
--
-- Modelled on `events`/`tasks`: a single `at` doubles as a one-off target date
-- AND the recurrence anchor, so the shared recurrence expander (_lib/recur) and
-- the calm "Bientôt" lead (lead_seconds + _lib/reminder) are reused verbatim —
-- no new surfacing logic. `at IS NULL` = undated → never surfaces in dated views.
--
-- CALM (NFR-CALM-1): budget_cents is a descriptive TARGET amount only — there is
-- deliberately NO saved-so-far / progress-to-goal column (no goal-chasing). No
-- counts, ranks, streaks. last_done_at is the same single "done" stamp chores use
-- (recurring: this cycle's completion; one-off: archived).
CREATE TABLE home_projects (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  kind          TEXT NOT NULL DEFAULT 'plan',     -- 'plan' | 'upkeep'
  title         TEXT NOT NULL,
  notes         TEXT,                              -- free-text detail
  budget_cents  INTEGER,                           -- optional TARGET amount (no progress bar)
  color         TEXT NOT NULL DEFAULT '#88a36f',
  at            INTEGER,                           -- target/occurrence date OR recurrence anchor (local-midnight unix sec); NULL = undated
  recur_json    TEXT,                              -- optional recurrence rule (same shape as tasks/events)
  lead_seconds  INTEGER,                           -- optional calm "Bientôt" lead window
  last_done_at  INTEGER,                           -- completion stamp (recurring: this cycle; one-off: archived)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX home_projects_household_idx ON home_projects(household_id);
