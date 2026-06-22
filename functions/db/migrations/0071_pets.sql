-- « Le cercle » → Pets: household animals as first-class people in the circle (a new
-- PersonKind 'pet', alongside contact + member). A pet shows as a card, can belong to
-- a famille group, and carries its own care fields: species/breed, birthday, microchip
-- #, a feeding schedule, sitter instructions, an optional weight log, and a VET that
-- points at an existing Business (0063). Soft-delete + R2 photo mirror contacts /
-- businesses. CALM: `weights` is a dated health LOG stored as JSON — deliberately NOT
-- an inventory quantity/stock_count column (calm-tenets stays green) and never a count
-- or streak. A pet is excluded from human relationship CLOSURE (it only ever carries a
-- generic « relative » kin tie via a famille group), so it never becomes a grandparent.
CREATE TABLE pets (
  id              TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL REFERENCES households(id),
  name            TEXT NOT NULL,
  species         TEXT,                       -- chien / chat / … (free text, with suggestions)
  breed           TEXT,
  photo_key       TEXT,                       -- R2 key for an optional photo
  colour          TEXT,                       -- disc tint when photoless
  birthday        TEXT,                       -- 'YYYY-MM-DD' ('0000-MM-DD' = year unknown), like contacts
  microchip       TEXT,                       -- micropuce number
  feeding         TEXT,                       -- feeding-schedule notes
  sitter_notes    TEXT,                       -- instructions for the babysitter / pet-sitter
  vet_business_id TEXT,                        -- → businesses(id): the vet (a Business, not a person)
  weights         TEXT NOT NULL DEFAULT '[]',  -- JSON [{date,kg,note}] — a health log, never an inventory count
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX pets_household_idx ON pets(household_id, name);
