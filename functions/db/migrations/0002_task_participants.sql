-- Shared-task participation — the "different tenant" model.
--
-- A chore/task is NOT owned by one person: a parent and a toddler can both help
-- at the same task, as different roles. This table is append-only ATTRIBUTION
-- ("who pitched in"), read to show "aidé par" — it is NOT a score. NFR-CALM-1
-- still holds: there is no hoardable count or streak here, only names and roles.
-- `tasks.current_idx` / `last_done_by` still answer "whose turn / last completed";
-- this records the richer "who contributed", including help that doesn't advance
-- the rotation (a toddler helping without completing).
CREATE TABLE task_participants (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  member_id      TEXT REFERENCES members(id),
  role           TEXT NOT NULL DEFAULT 'parent', -- 'parent' | 'child'
  contributed_at INTEGER NOT NULL
);
CREATE INDEX task_participants_task_idx ON task_participants(task_id, contributed_at DESC);
