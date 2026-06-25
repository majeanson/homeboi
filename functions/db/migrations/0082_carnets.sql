-- « Les carnets » — cared-for things (home + auto + their sub-things) as a tree.
-- Each carnet keeps an identity, a service history (care_log), a recurring upkeep
-- cadence (reuses home_projects via a new carnet_id), and a "long jeu" lifecycle
-- (installed_at + lifespan_months → a DERIVED "replace soon", no event rows).
--
-- Calm (NFR-CALM-1/3): no score, no streak, no inventory. cost_cents is an optional
-- invoice total (a recorded cost, never a running balance / progress-to-goal), and
-- there is deliberately NO quantity / stock column anywhere here.

-- The tree of cared-for things. parent_id NULL = a top-level carnet (a house, a car);
-- a child = a thing inside it (water heater, roof) or a room (kind 'zone').
CREATE TABLE carnets (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL REFERENCES households(id),
  parent_id       TEXT REFERENCES carnets(id),         -- NULL = top-level house/car
  kind            TEXT NOT NULL DEFAULT 'thing',        -- 'home'|'auto'|'appliance'|'system'|'zone'|'thing'
  name            TEXT NOT NULL,
  media_key       TEXT,                                 -- R2 photo of the thing
  color           TEXT NOT NULL DEFAULT '#88a36f',
  facts_json      TEXT,                                 -- kind-specific facts (built_year, make/model/year, serial, warranty_until, address…)
  installed_at    INTEGER,                              -- local-midnight unix sec: installed/acquired (long-jeu anchor)
  lifespan_months INTEGER,                              -- expected service life → derived "commence à y penser"
  link_id         TEXT,                                 -- bridge to an operational row (e.g. cars.id for kind 'auto'); L'auto stays untouched
  notes           TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  archived_at     INTEGER,                              -- soft archive (NULL = active)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX carnets_household_idx ON carnets(household_id);
CREATE INDEX carnets_parent_idx ON carnets(parent_id);

-- The carnet's service history ("le carnet"): dated entries, each with optional
-- notes, a recorded cost, the installer/servicer (a cercle business), and attached
-- R2 docs (invoice / manual / photo). One install row = Marc's water-heater example.
CREATE TABLE care_log (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  carnet_id     TEXT NOT NULL REFERENCES carnets(id),
  at            INTEGER NOT NULL,                       -- local-midnight unix sec: when it happened
  kind          TEXT NOT NULL DEFAULT 'note',           -- 'service'|'install'|'purchase'|'note'
  title         TEXT NOT NULL,
  note          TEXT,
  cost_cents    INTEGER,                                -- optional invoice total (a cost, NOT a balance)
  business_id   TEXT,                                   -- optional installer/servicer (cercle businesses)
  media_json    TEXT,                                   -- optional R2 doc keys as a JSON array
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX care_log_household_idx ON care_log(household_id);
CREATE INDEX care_log_carnet_idx ON care_log(carnet_id);

-- « En cas de pépin » — the house map: calm reference of LOCATIONS and how-tos
-- (water shutoff, breaker, spare key, how the thermostat works). Attaches to a home
-- carnet, or to a room (a 'zone' child). Locations + text, never a quantity.
CREATE TABLE home_pins (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  carnet_id     TEXT NOT NULL REFERENCES carnets(id),   -- a home, or a 'zone' child
  kind          TEXT NOT NULL DEFAULT 'where',          -- 'where'|'howto'|'doc'
  label         TEXT NOT NULL,                          -- "Valve d'eau principale"
  detail        TEXT,                                   -- location / how-to free text
  media_key     TEXT,                                   -- optional photo / doc
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX home_pins_household_idx ON home_pins(household_id);
CREATE INDEX home_pins_carnet_idx ON home_pins(carnet_id);

-- Reuse seam #1: a recurring-upkeep (Entretien) row can now belong to a carnet, so a
-- carnet's cadence rides the EXISTING home_projects → board/month pipeline unchanged.
-- NULL carnet_id = an ordinary household-level Projet/Entretien (today's behaviour).
ALTER TABLE home_projects ADD COLUMN carnet_id TEXT;
