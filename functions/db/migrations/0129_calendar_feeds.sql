-- « Les calendriers » — read-only ICS subscriptions (school, daycare, sports, work).
--
-- THE PROBLEM. Every event in this app was typed by a person. A school publishes its
-- pedagogical days, a team its game schedule, a city its collection calendar — all of
-- it already exists, as ICS, at a URL — and a household re-keys it by hand or simply
-- does not have it. This is the single biggest reduction in typing the app can make,
-- and it is pure INPUT: nothing here notifies, nudges or nags, so NFR-CALM-3 (zero
-- push) is untouched. A subscribed calendar simply appears in the calendar.
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- THE HOUSE RULE THIS BREAKS, AND WHY THAT IS THE RIGHT CALL.
--
-- `_lib/upkeep.ts` states it plainly: « no materialized occurrence rows, no cron ».
-- Every recurring thing here — events, habits, home_projects, transfer plans — stores
-- a RULE and expands it at read time. This table stores OCCURRENCES. That is the
-- first exception, so it is argued rather than slipped in:
--
--   · The rule exists because for household-owned recurrence the `Recur` JSON IS the
--     source of truth. Materializing creates a SECOND truth that can drift from it.
--   · A subscribed feed has no such JSON. The source of truth is a remote URL we do
--     not control and cannot query. Rows here are a CACHE OF A FETCH — structurally
--     the same as the service worker holding /api/img/* — not a second opinion about
--     something we own. Nothing can drift, because nothing else here computes them.
--   · And expanding at read time is not available anyway: `_lib/recur`'s `Recur` has
--     freq/interval/weekdays and nothing else — no UNTIL, no COUNT, no BYMONTHDAY, no
--     EXDATE, no RECURRENCE-ID. A school calendar uses most of those. Mapping RRULE
--     onto that shape would silently drop rules or, worse, show occurrences the feed
--     had CANCELLED. A wrong event on a wall tablet is worse than a missing one.
--
-- So the feed is expanded once, at fetch time, into a bounded window, by honouring the
-- feed's own expansion — which is the only way EXDATE and RECURRENCE-ID can be right.
--
-- The cron already exists (wrangler.toml `crons`, the nightly R2 backup); the refresh
-- rides it rather than adding a schedule.
-- ─────────────────────────────────────────────────────────────────────────────────
--
-- CALM. These rows are read-only and they are not yours to fix: a feed event never
-- feeds « À régler » (a friction signal promises a one-tap fix, and you cannot fix
-- someone else's calendar), never carries a count, and never opens an editor.

CREATE TABLE calendar_feeds (
  id            TEXT PRIMARY KEY,
  -- soft ref (no FK), like household_preferences / transfer_plans: a household is
  -- deleted by id as one explicit statement, never by cascade.
  household_id  TEXT NOT NULL,
  url           TEXT NOT NULL,                     -- the ICS address (https only, enforced in the handler)
  label         TEXT NOT NULL,                     -- « École de Léa », « Collecte des ordures »
  colour        TEXT,                              -- one spelling, per the schema conventions
  -- Whose calendar this is, as a SOFT member ref (no FK, DB-5 pattern 1: the member
  -- is the SUBJECT — whose life these events belong to — not the author, since the
  -- author is a school). NULL = the whole Maisonnée.
  member_id     TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,        -- off = keep the row, stop reading it
  -- Refresh bookkeeping. `etag` / `last_modified` make the nightly fetch nearly free
  -- on a feed that has not changed (a conditional GET), which matters because this
  -- runs for every household on one Worker invocation.
  etag          TEXT,
  last_modified TEXT,
  last_fetch_at INTEGER,                           -- unix secs of the last COMPLETED fetch
  -- Why the last fetch failed, as a short code the UI localizes ('http-404',
  -- 'too-big', 'not-ics', 'network'). NULL = the last fetch was fine. Kept rather
  -- than logged: a feed that quietly stopped updating is the failure mode a
  -- subscription has, and the household is the only one who can fix the URL.
  last_error    TEXT,
  -- How much of the feed we understood. A VEVENT whose RRULE uses a rule our expander
  -- does not implement contributes only its first occurrence, and this counts those —
  -- so the UI can say « 3 événements récurrents ne sont pas tous affichés » instead of
  -- pretending the calendar is complete. Honesty over silence (the OCR « Rapport »
  -- precedent).
  partial_count INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX calendar_feeds_household_idx ON calendar_feeds(household_id, deleted_at);

-- The expanded window. Replaced WHOLESALE per feed on every successful fetch — never
-- merged, never diffed: the feed is the truth, and a row that survives a refresh it
-- was not in is an event the school already cancelled.
CREATE TABLE feed_events (
  id            TEXT PRIMARY KEY,
  feed_id       TEXT NOT NULL,                     -- soft ref: the sweep deletes by feed_id
  household_id  TEXT NOT NULL,                     -- denormalized so the read never joins
  -- The VEVENT's own UID plus the occurrence's start, so a recurring series' days stay
  -- distinguishable. Not unique-constrained: the wholesale replace makes duplicates
  -- impossible, and a feed with genuinely duplicate UIDs is the feed's problem to have.
  uid           TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT,
  start_at      INTEGER NOT NULL,                  -- unix secs (local midnight when all_day)
  end_at        INTEGER,                           -- exclusive; NULL = a point in time
  all_day       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX feed_events_household_idx ON feed_events(household_id, start_at);
CREATE INDEX feed_events_feed_idx ON feed_events(feed_id);
