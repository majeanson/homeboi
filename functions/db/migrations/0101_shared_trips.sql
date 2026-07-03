-- « Voyage partagé » — ONE trip, live-edited by up to 6 households. Capability-scoped
-- store keyed by shared trip id, NOT household_id (design doc PLAN B): the trip lives
-- in NEITHER household, so authed() and every household filter stay untouched.
-- Authorization = a live shared_trip_members row (requireSharedTripMember).
--
-- This is PLAN B (sync), the app's first cross-household collaborative feature. The
-- family-share substrate (migration 0100) proved the one-time COPY; trips are the case
-- Marc truly wants LIVE — two-to-six operator accounts share one editable trip. Rather
-- than granting cross-tenant access on the household `trips` tables (which would leak
-- into resolveActor + every household query filter), the shared trip lives in its OWN
-- capability-scoped tables here; membership is the authorization boundary.
--
-- Calm (NFR-CALM-1/3): no score, no streak, no ranking, no inventory. Packing is a
-- soft check-off (packed_at, like todos.done_at — never a count / "n of m" / a
-- quantity). There is deliberately NO quantity column anywhere here. Additive,
-- forward-only, filename-locked.

CREATE TABLE shared_trips (
  id                  TEXT PRIMARY KEY,
  owner_household_id  TEXT NOT NULL,       -- soft household ref (no FK): may dissolve / rotate invite
  title               TEXT NOT NULL,
  destination         TEXT,
  start_at            INTEGER,             -- local-midnight unix sec, like trips
  end_at              INTEGER,             -- inclusive last day
  media_kind          TEXT,                -- cover 'image'; media_key set iff media_kind set
  media_key           TEXT,                -- SHARE-OWNED R2 copy (st_), freed on dissolve
  colour              TEXT NOT NULL DEFAULT '#88a36f',
  notes               TEXT,
  invite_nonce        TEXT NOT NULL,       -- baked into the signed join token; rotate = links die
  position            INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER,
  deleted_at          INTEGER              -- soft delete = dissolved
);
-- No members JSON: who's going = the membership table (member ids never cross households).

-- THE one cross-tenant table in the app: which households hold a live grant.
-- References households deliberately (a grant is to a tenant); every other shared_*
-- household column is a soft TEXT ref instead.
CREATE TABLE shared_trip_members (
  id              TEXT PRIMARY KEY,
  shared_trip_id  TEXT NOT NULL REFERENCES shared_trips(id),
  household_id    TEXT NOT NULL REFERENCES households(id),
  role            TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member' (kind-style sub-type)
  label           TEXT NOT NULL DEFAULT '',        -- household display-name snapshot (attribution)
  colour          TEXT NOT NULL DEFAULT '#88a36f', -- attribution tint (pseudo-face)
  joined_at       INTEGER NOT NULL,                -- when the grant (re)activated; rejoin refreshes it
  revoked_at      INTEGER,                         -- left/kicked; live = NULL (rejoin un-revokes)
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX shared_trip_members_uniq ON shared_trip_members(shared_trip_id, household_id);
CREATE INDEX shared_trip_members_household_idx ON shared_trip_members(household_id, revoked_at);

-- Mirrors trip_notes minus member scoping: attribution is a household, never a member id.
CREATE TABLE shared_trip_notes (
  id                   TEXT PRIMARY KEY,
  shared_trip_id       TEXT NOT NULL REFERENCES shared_trips(id),
  category             TEXT NOT NULL DEFAULT 'general', -- same set as trip_notes
  label                TEXT,
  text                 TEXT NOT NULL DEFAULT '',
  media_kind           TEXT,               -- 'audio'|'drawing'|'image'; key iff kind
  media_key            TEXT,               -- SHARE-OWNED (st_)
  scene_key            TEXT,               -- editable drawing scene
  author_household_id  TEXT,               -- soft household ref (no FK): ATTRIBUTION, never scope
  author_label         TEXT,               -- free-text household name at write time (survives leave)
  date                 INTEGER,            -- NULL = Infos; local-midnight = itinerary day
  position             INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER,
  deleted_at           INTEGER
);
CREATE INDEX shared_trip_notes_trip_idx
  ON shared_trip_notes(shared_trip_id, deleted_at, date, category, position);

-- Per-HOUSEHOLD bags (product decision): household_id is the WRITE SCOPE (soft ref);
-- bag_label NULL = that household's shared bag, else a free-text per-person bag name.
CREATE TABLE shared_trip_packing (
  id              TEXT PRIMARY KEY,
  shared_trip_id  TEXT NOT NULL REFERENCES shared_trips(id),
  household_id    TEXT NOT NULL,           -- soft household ref (no FK): whose bag / who may edit
  bag_label       TEXT,                    -- NULL = the household's shared bag
  text            TEXT NOT NULL,
  packed_at       INTEGER,                 -- soft check, NOT a count
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER,
  deleted_at      INTEGER
);
CREATE INDEX shared_trip_packing_trip_idx
  ON shared_trip_packing(shared_trip_id, deleted_at, household_id, position);
