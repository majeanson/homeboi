-- « Le cercle » → Business tab: a household directory of services / vendors
-- (vet, hospital, plumber, electrician, business cards…). DELIBERATELY a separate
-- table from contacts — a business is NOT a person: it never enters the cercle
-- people graph (unifyCircle), relationships, families, the tree or birthdays. It's
-- strictly for quick access (call/write/map), notes ("remember"), and linking a
-- rendez-vous (events.business_id, see 0064). Soft-delete + R2 card photo mirror
-- the contacts / family_notes conventions.
CREATE TABLE businesses (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name         TEXT NOT NULL,
  category     TEXT,            -- free text with suggestions (vet, plombier, hôpital…)
  phone        TEXT,
  email        TEXT,
  address      TEXT,            -- plain string; a "Itinéraire" button maps it
  website      TEXT,
  notes        TEXT,            -- the "remember" field
  photo_key    TEXT,            -- R2 key for an optional business-card photo
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX businesses_household_idx ON businesses(household_id, name);
