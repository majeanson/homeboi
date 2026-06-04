-- Babillard initial schema.
--
-- Forward-only, additive, filename-locked (wrangler tracks applied state by
-- filename — never rename this once it has run). All timestamps are unix
-- seconds (INTEGER) to dodge the SQLite/D1 datetime-string traps.
--
-- A note on what is deliberately ABSENT: there is no `streaks`, `points`,
-- `badges`, or `push_subscriptions` table. The anti-addiction tenets
-- (NFR-CALM-1/3 in the PRD) are enforced structurally — the schema has
-- nowhere to store a hoardable score or a notification subscription, so the
-- product can't drift into a dopamine loop by accident.

-- ============================================================================
-- Tenancy
-- ============================================================================

-- One household = one tenant. tier gates the paid depth (voice, meal->list,
-- multiple boards); 'free' | 'maisonnee'. status 'active' | 'frozen'.
CREATE TABLE households (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  tier               TEXT NOT NULL DEFAULT 'free',
  status             TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- Host -> household, for the multi-tenant middleware. Prototype runs single
-- host; this table lets prod route by custom domain later without a reshape.
CREATE TABLE household_domains (
  host         TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_at   INTEGER NOT NULL
);

-- The operator(s): real login (HMAC cookie keyed on email). One household per
-- operator email in the prototype.
CREATE TABLE operators (
  email        TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  created_at   INTEGER NOT NULL
);

-- People on the board. is_child drives the kid view + "pick your face" write
-- attribution. avatar_kind 'color' | 'photo'; avatar_ref is a hex colour or
-- (later) an R2 key.
CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  avatar_kind  TEXT NOT NULL DEFAULT 'color',
  avatar_ref   TEXT NOT NULL DEFAULT '#7a8b6f',
  is_child     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX members_household_idx ON members(household_id);

-- ============================================================================
-- Device pairing (kiosk auth — chosen over capability-URL)
-- ============================================================================

-- A paired wall tablet. token_hash is the SHA-256 of the device token the
-- tablet stores; we never keep the token itself. revoked_at lets the operator
-- kill a lost tablet without rotating anyone else.
CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  label        TEXT NOT NULL DEFAULT 'Tablette',
  token_hash   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX devices_household_idx ON devices(household_id);

-- Short-lived pairing handshake. The tablet POSTs to start one (no auth),
-- shows the 6-digit code; the logged-in operator claims it by code, which
-- binds the household and mints the device token. status 'pending' |
-- 'approved' | 'expired'. token_once carries the freshly-minted device token
-- back to the polling tablet exactly once, then is cleared on first read.
CREATE TABLE pairing_codes (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  household_id TEXT REFERENCES households(id),
  device_id    TEXT REFERENCES devices(id),
  token_once   TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX pairing_codes_code_idx ON pairing_codes(code);

-- ============================================================================
-- The capture spine
-- ============================================================================

-- Append-only log of every raw capture, with what the intent-router decided.
-- Keeping the original words means a misroute can be re-classified without
-- losing what the human actually said. source 'text' | 'voice'.
CREATE TABLE captures (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  raw_text      TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'text',
  resolved_type TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX captures_household_idx ON captures(household_id, created_at DESC);

-- ============================================================================
-- Board content
-- ============================================================================

CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id    TEXT REFERENCES members(id),
  title        TEXT NOT NULL,
  start_at     INTEGER NOT NULL,
  all_day      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX events_household_idx ON events(household_id, start_at);

-- Chores with a round-robin rotation. rotation_json is an ordered array of
-- member ids; current_idx points at whose turn it is. Marking done advances
-- the index and stamps who/when — the only "credit" that exists (no points).
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  rotation_json TEXT NOT NULL DEFAULT '[]',
  current_idx   INTEGER NOT NULL DEFAULT 0,
  last_done_at  INTEGER,
  last_done_by  TEXT REFERENCES members(id),
  created_at    INTEGER NOT NULL
);
CREATE INDEX tasks_household_idx ON tasks(household_id);

-- The shared list (groceries + anything). source tells us where an item came
-- from: 'manual' | 'capture' | 'meal' | 'pantry-low'. checked_at null = open.
CREATE TABLE list_items (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  text         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual',
  checked_at   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX list_items_household_idx ON list_items(household_id, checked_at);

-- ============================================================================
-- Garde-manger (kitchen)
-- ============================================================================

-- Weekly meal plan. slot 'supper' for now (breakfast/lunch later). date is a
-- unix-seconds midnight. cook_member_id feeds the board's "ce soir" row.
CREATE TABLE meals (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL REFERENCES households(id),
  date           INTEGER NOT NULL,
  slot           TEXT NOT NULL DEFAULT 'supper',
  title          TEXT NOT NULL,
  cook_member_id TEXT REFERENCES members(id),
  created_at     INTEGER NOT NULL
);
CREATE INDEX meals_household_idx ON meals(household_id, date);

-- ONLY low/out, never a full inventory (brief tenet 3 — the upkeep tax is what
-- kills pantry apps). Marked the moment you notice; flows onto the list.
CREATE TABLE pantry_low (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  item         TEXT NOT NULL,
  marked_at    INTEGER NOT NULL
);
CREATE INDEX pantry_low_household_idx ON pantry_low(household_id);

-- ============================================================================
-- Kid view (pre-reader visual routines)
-- ============================================================================

-- An ordered set of picture cards for one child. cards_json is
-- [{ icon, label, narration }]. No text is required to USE it; label/narration
-- are for the adult who sets it up and for on-device read-aloud.
CREATE TABLE routines (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id    TEXT NOT NULL REFERENCES members(id),
  name         TEXT NOT NULL,
  cards_json   TEXT NOT NULL DEFAULT '[]',
  created_at   INTEGER NOT NULL
);
CREATE INDEX routines_household_idx ON routines(household_id);

-- Per-day completion. done_idx_json is the set of finished card indices for
-- that date. It RESETS daily (a new date = a fresh empty run) — the day
-- empties and stays empty (NFR-CALM-4). No history is hoarded.
CREATE TABLE routine_runs (
  id            TEXT PRIMARY KEY,
  routine_id    TEXT NOT NULL REFERENCES routines(id),
  date          INTEGER NOT NULL,
  done_idx_json TEXT NOT NULL DEFAULT '[]',
  updated_at    INTEGER NOT NULL,
  UNIQUE (routine_id, date)
);
