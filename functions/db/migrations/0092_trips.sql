-- « Voyage » — a trip notebook (Carnet de voyage). A first-class, temporally-bounded
-- container for a family trip: a date range that spans the calendar as a multi-day
-- band, with day-by-day itinerary, categorized info entered with the SAME composer as
-- a fridge note (text / voice / drawing / photo), per-member packing lists, and
-- documents (reservation/passport PDFs + photos) available offline during travel.
--
-- DELIBERATELY its own tables, not the carnets tree (carnets model CARED-FOR THINGS
-- with an upkeep cadence + lifespan; a trip is an EXPERIENCE with a start/end and
-- day-by-day notes) and not events/day_notes (no description, no multi-day span, no
-- media). Additive, forward-only, filename-locked.
--
-- Calm (NFR-CALM-1/3): no score, no streak, no ranking, no inventory. Packing is a
-- check-off list (packed_at is a soft MARK, like todos.done_at — never a count / a
-- "n of m" / a quantity). There is deliberately NO quantity column anywhere here.

-- The trip itself. One row per trip; start_at/end_at are LOCAL-midnight unix seconds
-- (inclusive last day), bucketed like meals/day_notes/todos.day so the calendar band
-- and the "is this day inside a trip" test stay DST-safe.
CREATE TABLE trips (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  destination   TEXT,                              -- "Québec", "Floride" — free text
  start_at      INTEGER,                           -- local-midnight unix sec (first day)
  end_at        INTEGER,                           -- local-midnight unix sec (last day, inclusive)
  members       TEXT NOT NULL DEFAULT '[]',        -- JSON array of member-id soft refs (who's going)
  media_kind    TEXT,                              -- cover: 'image' (the only cover kind today)
  media_key     TEXT,                              -- R2 object key for the cover photo
  colour        TEXT NOT NULL DEFAULT '#88a36f',   -- band/card tint (spelling: colour, per schema rules)
  notes         TEXT,                              -- a free top-level note (optional)
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER                            -- soft delete (live set = NULL)
);
CREATE INDEX trips_household_idx ON trips(household_id, deleted_at, start_at);

-- The trip's content, UNIFIED: categorized info + itinerary days + documents +
-- contacts all live here, exactly like a generalized family_notes row (text OR
-- media, optionally member-scoped). Three discriminators shape the row:
--   category : what kind of info — flight|hotel|car|activity|contact|document|general
--   member_id: soft ref → "kids stuff / parents stuff"; NULL = the whole trip
--   date     : NULL = atemporal info (the Infos tab); set (local midnight) = an
--              ITINERARY entry shown under that trip day (the calendar/day page)
-- A DOCUMENT is just a row with category='document' carrying a media_key (image OR
-- pdf; the key self-describes its type via an extension, see _lib/r2 extFromType).
CREATE TABLE trip_notes (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  trip_id       TEXT NOT NULL REFERENCES trips(id),
  category      TEXT NOT NULL DEFAULT 'general',   -- flight|hotel|car|activity|contact|document|general
  label         TEXT,                              -- optional short heading ("Hôtel Le Bonne Entente")
  text          TEXT NOT NULL DEFAULT '',
  media_kind    TEXT,                              -- 'audio' | 'drawing' | 'image' (same trio as notes)
  media_key     TEXT,                              -- R2 object key
  scene_key     TEXT,                              -- editable drawing scene (#1)
  member_id     TEXT REFERENCES members(id),       -- soft scope: kids/parents stuff; NULL = whole trip
  date          INTEGER,                           -- NULL = info; local-midnight = itinerary day
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX trip_notes_trip_idx ON trip_notes(trip_id, deleted_at, date, category, position);

-- Per-member packing. member_id NULL = the SHARED ("Partagé") list; a member id = that
-- person's own list (Marc's "each member could have their own packing list"). Reuses
-- the todos UI patterns (CheckRow, useDeferredRemoval) but NOT the todos table, so a
-- packing item never leaks onto the board glance or the month grid. packed_at is a
-- soft check (mirrors todos.done_at): NULL = to pack, set = packed. Never a count.
CREATE TABLE trip_packing (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  trip_id       TEXT NOT NULL REFERENCES trips(id),
  member_id     TEXT REFERENCES members(id),       -- soft ref; NULL = the shared list
  text          TEXT NOT NULL,
  packed_at     INTEGER,                            -- soft check (NULL = unpacked); NOT a count
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX trip_packing_trip_idx ON trip_packing(trip_id, deleted_at, member_id, position);
