-- « Voyage partagé » → « Qui apporte quoi » + « Qui cuisine » (2026-11-12). A camping
-- weekend between friends needs ONE list everybody sees — the tent-cuisine, the stove,
-- the coolers — where a household says « je l'apporte », and each supper of the trip
-- needs a household that says « on cuisine ». Both are the same gesture: a shared row a
-- household CLAIMS. One table, `kind` discriminates:
--
--   kind 'gear' — a thing to bring. date/slot NULL. Any member adds; one household claims.
--   kind 'meal' — one meal of one trip day. date = local midnight, slot = 'breakfast' |
--                 'lunch' | 'supper'. text = the menu (may be empty). One live row per
--                 (trip, date, slot), enforced by the handler.
--
-- Capability-scoped like the rest of 0101: keyed by shared_trip_id, authorized by a live
-- shared_trip_members row. Calm (NFR-CALM-1/3): a claim is a NAME on a row, never a count,
-- a score or an « n of m » — and deliberately NO quantity column (the calm test).

CREATE TABLE shared_trip_claims (
  id                   TEXT PRIMARY KEY,
  shared_trip_id       TEXT NOT NULL REFERENCES shared_trips(id),
  kind                 TEXT NOT NULL DEFAULT 'gear',  -- 'gear' | 'meal' (entity sub-type)
  text                 TEXT NOT NULL DEFAULT '',      -- the item, or the menu
  date                 INTEGER,                       -- meal: local-midnight trip day; gear: NULL
  slot                 TEXT,                          -- meal: 'breakfast'|'lunch'|'supper'; gear: NULL
  household_id         TEXT,                          -- soft household ref (no FK): WHO TAKES IT ON; NULL = nobody yet
  household_label      TEXT,                          -- free-text household name at claim time (survives leave)
  author_household_id  TEXT,                          -- soft household ref (no FK): who ADDED the row (attribution)
  position             INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER,
  deleted_at           INTEGER
);
CREATE INDEX shared_trip_claims_trip_idx
  ON shared_trip_claims(shared_trip_id, deleted_at, kind, date, position);
