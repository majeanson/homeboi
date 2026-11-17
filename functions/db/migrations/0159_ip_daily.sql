-- How many accounts and demos one ADDRESS opened today (review 2026-11-17, P0 #6).
--
-- The rate-limit bindings (_lib/rateLimit.ts) are flood bounds: sixty-second windows,
-- per colo. A patient visitor could open a fresh unverified household every few
-- seconds, all day, and each new household came with its own daily AI and upload
-- budget (_lib/usage.ts) — the per-household ceiling was multiplied by the number of
-- signups. This counts account creations (signup, operator-join) and demo mints per
-- caller address per day, so the ceiling is per PERSON again, roughly.
--
-- ip_hash: sha256 of the address keyed with SESSION_SECRET — never the address itself.
--   It cannot be reversed by reading the table, and it changes nothing a visitor sees.
-- day: localDayStart in the deployment's default zone (like door_daily), not a
--   household's — the door opens before any household exists.
-- event: 'account' | 'demo'.
-- No household column: pruned after two days by the nightly cron, never swept.
CREATE TABLE ip_daily (
  ip_hash     TEXT NOT NULL,
  day         INTEGER NOT NULL,
  event       TEXT NOT NULL,
  n           INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, day, event)
);
