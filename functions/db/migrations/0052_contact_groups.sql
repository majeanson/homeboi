-- Named people groups (Famille Tremblay, Amis du soccer, Collègues de Marc…).
-- Complement the auto-detected Union-Find family groups — these are EXPLICIT labels
-- a household assigns. A person (contact OR member) can belong to 0 → N groups.
-- No FK on person_id (polymorphic); validated by the handler. Cascades on group delete.
-- Contact/member deletions clean up their own rows in their respective handlers.
CREATE TABLE IF NOT EXISTS contact_groups (
  id           TEXT     PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  household_id TEXT     NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT     NOT NULL,
  kind         TEXT     NOT NULL DEFAULT 'other', -- 'family' | 'friends' | 'work' | 'other'
  colour       TEXT,
  sort_order   INTEGER  NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_groups_household ON contact_groups(household_id);

CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id    TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  person_id   TEXT NOT NULL,
  person_kind TEXT NOT NULL DEFAULT 'contact',
  PRIMARY KEY (group_id, person_id, person_kind)
);

CREATE INDEX IF NOT EXISTS idx_contact_group_members_group  ON contact_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_contact_group_members_person ON contact_group_members(person_id, person_kind);
