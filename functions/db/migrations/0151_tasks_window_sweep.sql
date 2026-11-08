-- 0151 — after the merge (0150): put in the spine any LOOSE to-do an old Worker wrote to
-- `todos` in the minute between 0150 running and the new Worker being deployed. Until now
-- `/api/todos` read such a row from `todos` whole, so it stayed visible; from here it reads
-- like every other task (the Tâches view, a subject's page, the finder).
--
-- The same mapping as 0150's todo block, word for word. IDEMPOTENT: a row whose id is
-- already in the spine is not copied again, and only rows that were copied (or already
-- there) leave `todos`. Departure checklist instances (a template or a section) are not
-- tasks and are not touched. On production the window most likely wrote nothing: then
-- both statements change zero rows.
--
-- No column is added. subject_kind / subject_id are copied as they are: still the soft
-- subject ref of 0146, PAS DE CLÉ ÉTRANGÈRE, nullable.
INSERT INTO home_projects
  (id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   member_id, position, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at)
SELECT
   id, household_id, 'todo', title, NULL, NULL, colour, day, NULL, 'anchor', NULL,
   NULL, done_at, NULL, NULL, NULL, '[]', 0,
   member_id, position, NULL, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at
FROM todos
WHERE source_template_id IS NULL AND section IS NULL
  AND id NOT IN (SELECT id FROM home_projects);

DELETE FROM todos
WHERE source_template_id IS NULL AND section IS NULL
  AND id IN (SELECT id FROM home_projects);
