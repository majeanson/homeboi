-- À compléter, composed lists. A template ("liste") can now INCLUDE other
-- templates (a ref item in items_json: { "ref": "<templateId>" }) on top of plain
-- item labels. Instantiating a composed template flattens to ONE list of todos
-- GROUPED BY SECTION: each included sub-list becomes a section whose heading is the
-- sub-list's title; loose items have no section (NULL). `section` is render-only
-- grouping — not a new entity, not a count. The SAME item label coming from two
-- different sub-lists is KEPT in both sections (attributed to its source), never
-- merged. Additive, forward-only, filename-locked.
ALTER TABLE todos ADD COLUMN section TEXT;
