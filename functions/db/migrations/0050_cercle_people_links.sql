-- « Le cercle » phase 2: generalize relationship edges so a node is ANY person —
-- a contact OR a household MEMBER (the faces). This lets a family link its own
-- members to each other ("Maman est la mère de Léa") and to contacts, from the
-- cercle tab OR Réglages ▸ Membres, so the household's own structure is trackable.
--
-- Phase 1's contact_links FK-restricted both endpoints to contacts(id). SQLite
-- can't drop a column constraint in place, so we REBUILD the table (the standard
-- create-copy-drop-rename dance), dropping the contacts FK and adding a kind tag
-- per endpoint. A person endpoint is now (kind, id) where kind ∈ 'contact'|'member';
-- the id is validated against the matching table in the handler (no DB-level FK,
-- since it's polymorphic). Existing rows are all contact↔contact, so they migrate
-- with kind 'contact'. Forward-only, filename-locked. No calm-forbidden columns.
CREATE TABLE contact_links_new (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  person_a_id   TEXT NOT NULL,
  person_a_kind TEXT NOT NULL DEFAULT 'contact',  -- 'contact' | 'member'
  person_b_id   TEXT NOT NULL,
  person_b_kind TEXT NOT NULL DEFAULT 'contact',
  type          TEXT NOT NULL,
  reverse_type  TEXT NOT NULL,
  label         TEXT,
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

INSERT INTO contact_links_new
  (id, household_id, person_a_id, person_a_kind, person_b_id, person_b_kind, type, reverse_type, label, notes, created_at, updated_at)
SELECT
  id, household_id, person_a_id, 'contact', person_b_id, 'contact', type, reverse_type, label, notes, created_at, updated_at
FROM contact_links;

DROP TABLE contact_links;
ALTER TABLE contact_links_new RENAME TO contact_links;

CREATE INDEX contact_links_household_idx ON contact_links(household_id);
CREATE INDEX contact_links_person_a_idx ON contact_links(person_a_id);
CREATE INDEX contact_links_person_b_idx ON contact_links(person_b_id);
