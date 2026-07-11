-- Extend the `is_sample` demo-data flag (migrations 0096/0097/0114) to
-- todo_templates, so the demo household can seed departure checklists
-- (« Avant de partir », « Sac de soccer » — the mig-0116 split's board card) and
-- « Vider les exemples » / the 24 h reseed still removes only the demo rows.
-- Same pattern as 0114: default 0, no backfill needed.
ALTER TABLE todo_templates ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;
