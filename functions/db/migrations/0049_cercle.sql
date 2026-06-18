-- Le cercle — the household's people directory (family + circle of friends), so
-- anyone glancing at the wall tablet can reconstruct WHO'S WHO: a face, a
-- relationship, a birthday, a way to reach them. Adapted from the standalone
-- "famolo / family-social" relationship visualizer, recast onto our
-- household-scoped, calm, dual-audience model.
--
-- Two tables:
--   contacts       — one person. Photo lives in R2 (photo_key, served via
--                    /api/img/<key>); everything else is plain text. `birthday`
--                    is a 'YYYY-MM-DD' string (use 0000 for the year when it's
--                    unknown, so the day/month still drive the calm board chip).
--                    `member_id` OPTIONALLY links a contact to a household face
--                    (attribution/colour only — never an access decision, like
--                    todos/notes). `tags`, `address`, `custom_fields` ride as JSON
--                    so the shape can grow without a migration (no UI for custom
--                    fields yet — column reserved).
--   contact_links  — a typed relationship edge between two contacts, stored ONCE.
--                    `type` is A→B (e.g. A is B's parent); `reverse_type` is the
--                    auto-derived B→A side (B is A's child) so either person's
--                    profile can show the relation without a second row. Family
--                    GROUPS are derived at read time (Union-Find over the family
--                    edges, src/lib/cercle.ts) — deliberately NOT stored.
--
-- CALM: a directory, not a social network. No feed, no counts, no streaks, no
-- push — birthdays surface only through the existing "Bientôt" board lead-time.
-- None of these columns trip calm-tenets.test.ts. Additive, forward-only,
-- filename-locked.
CREATE TABLE contacts (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL DEFAULT '',
  nickname      TEXT,
  photo_key     TEXT,                 -- R2 key (served via /api/img/<key>); NULL = initials tile
  birthday      TEXT,                 -- 'YYYY-MM-DD' ('0000-MM-DD' when year unknown); NULL = none
  email         TEXT,
  phone         TEXT,
  address       TEXT,                 -- JSON {street,city,state,postalCode,country}; NULL = none
  notes         TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',   -- JSON array of free-text tags
  member_id     TEXT REFERENCES members(id),  -- optional link to a household face
  custom_fields TEXT NOT NULL DEFAULT '[]',   -- JSON array {label,value,type}; reserved, no UI yet
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX contacts_household_idx ON contacts(household_id, last_name, first_name);

CREATE TABLE contact_links (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  person_a_id   TEXT NOT NULL REFERENCES contacts(id),
  person_b_id   TEXT NOT NULL REFERENCES contacts(id),
  type          TEXT NOT NULL,        -- A→B relation key (see src/lib/cercle.ts RELATIONSHIP_TYPES)
  reverse_type  TEXT NOT NULL,        -- B→A relation key (auto-derived inverse)
  label         TEXT,                 -- optional free-text override ("Grand-maman de Léa")
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX contact_links_household_idx ON contact_links(household_id);
CREATE INDEX contact_links_person_a_idx ON contact_links(person_a_id);
CREATE INDEX contact_links_person_b_idx ON contact_links(person_b_id);
