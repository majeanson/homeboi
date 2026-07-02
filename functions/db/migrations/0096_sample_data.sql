-- Sample/demo data for a first-time household (onboarding Phase 1). A fresh
-- account is seeded with a small, calm, media-free demo family so the board is
-- alive on first login; the operator keeps it or clears it from the board banner
-- (« Exemples pour explorer ») or Réglages.
--
-- `is_sample` tags every seeded row so "clear the examples" removes ONLY the
-- demo — never a row the operator created while exploring (mix-safe). It's an
-- ordinary boolean flag (0/1), not a count/rank/streak — the calm-tenet test
-- (calm-tenets.test.ts) is untouched. Forward-only; default 0 so every existing
-- row (and every hand-added row) reads as real.
ALTER TABLE members     ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events      ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meals       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE list_items  ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pantry_low  ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes     ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE routines    ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos       ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
