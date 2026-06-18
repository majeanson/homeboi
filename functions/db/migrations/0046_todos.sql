-- À cocher — standalone check-off lists (todos), DISTINCT from the loose-chore
-- "À faire" board section (those ride the `tasks` table + rotation machinery and
-- the board payload's own `todos` field). A todo here is a calm, finite action
-- item that empties and stays empty — two scopes:
--   - GLOBAL  (day IS NULL): a standing item, shown until checked + cleared.
--   - PER-DAY (day = local-midnight unix sec): pinned to one calendar day, same
--     bucketing as meals / day_notes.
-- Shared by the household, with an OPTIONAL face (member_id) for attribution only
-- (like list items + notes — never an access decision). "Done" is a MARK in place
-- (done_at set), not a delete: "Effacer cochées" removes the checked rows, exactly
-- like La liste. There is deliberately NO count / score / streak column — checking
-- a todo off is its own quiet reward (NFR-CALM-1).
--
-- todo_templates — reusable checklists ("Avant de partir", "Chez grand-papa"): a
-- title + an ordered list of item labels (items_json). Instantiating a template
-- drops its items in as real, independent todos (global or onto a day), so a
-- stressful departure is pre-thought-out. The template is the master; the
-- instantiated todos are copies — checking one never touches the template.
-- Additive, forward-only, filename-locked.
CREATE TABLE todos (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  day           INTEGER,            -- NULL = global; else local-midnight unix sec
  member_id     TEXT REFERENCES members(id),
  position      INTEGER NOT NULL DEFAULT 0,
  done_at       INTEGER,            -- NULL = open; set = checked (marked in place)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX todos_house_day ON todos(household_id, day);

CREATE TABLE todo_templates (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  items_json    TEXT NOT NULL DEFAULT '[]',  -- ordered array of item labels (strings)
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
