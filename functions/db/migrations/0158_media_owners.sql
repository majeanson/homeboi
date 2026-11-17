-- Who owns which R2 blob (review 2026-11-17, P0 #4).
--
-- R2 keys are flat (`<prefix>_<id>`) and public by design: /api/img/<key> needs no
-- session, so a key is seen by anyone shown the picture (a share, a guest link, a
-- shared trip). A row's media key was whatever the request wrote into it, and every
-- cleanup freed the key its row named. So a household could store a key it had SEEN —
-- another family's child's photo, or a nightly backup's `backup/<hid>/…` — delete its
-- own row, and erase the other family's blob.
--
-- Every blob that enters R2 now records its household here (_lib/r2.ts putR2Blob: an
-- upload, a server fetch, a copy), and deleteR2Blob frees a blob only by deleting THIS
-- household's row for it. A key with no row (foreign, or a legacy blob the backfill
-- below cannot see) is left in R2: the failure is an orphan, never someone else's loss.
--
-- media_key: the R2 key, PRIMARY KEY — one owner per blob.
-- household_id: soft household ref (no FK, like every scope column the sweep deletes by).
-- Identity, not content: excluded from takeout/restore (TAKEOUT_EXCLUDE), swept with the
-- household (demoHousehold HOUSEHOLD_TABLES).
CREATE TABLE media_owners (
  media_key     TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX media_owners_household_idx ON media_owners(household_id);

-- BACKFILL: every key a household's rows already name. A spurious row is harmless (it
-- only lets that household free a key its own rows already reference — what it could do
-- yesterday), and a missed one only leaks a blob later, so this errs wide. A key two
-- households both name goes to whichever INSERT sees it first; the only way that happens
-- is the very attack this closes, so there is no right owner to prefer.
-- A plain key has no '/' and no ':' (that keeps out an https image and backup/…).

-- Scalar columns (one statement each: D1 caps a compound SELECT).
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT scene_key AS k, household_id AS h FROM notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM family_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT scene_key AS k, household_id AS h FROM family_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM drawings) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT scene_key AS k, household_id AS h FROM drawings) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM trip_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT scene_key AS k, household_id AS h FROM trip_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM photos) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM contacts) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM contact_photos) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM businesses) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM pets) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM carnets) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM home_pins) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM trips) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, household_id AS h FROM staged_media) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT avatar_ref AS k, household_id AS h FROM members WHERE avatar_kind = 'photo') WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT image AS k, household_id AS h FROM recipes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT e.media_key AS k, r.household_id AS h FROM remark_events e JOIN remarks r ON r.id = e.remark_id) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT e.scene_key AS k, r.household_id AS h FROM remark_events e JOIN remarks r ON r.id = e.remark_id) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, owner_household_id AS h FROM shared_trips) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT media_key AS k, author_household_id AS h FROM shared_trip_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT k, h, unixepoch() FROM (SELECT scene_key AS k, author_household_id AS h FROM shared_trip_notes) WHERE k IS NOT NULL AND k <> '' AND h IS NOT NULL AND k NOT LIKE '%/%' AND k NOT LIKE '%:%' AND length(k) <= 64;

-- Keys inside JSON (routine cards and their parallel arrays, recipe step and source
-- images, carnet documents, share snapshots): every text leaf shaped like a key.
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM routines s, json_tree(CASE WHEN json_valid(s.cards_json) THEN s.cards_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM routines s, json_tree(CASE WHEN json_valid(s.cards_narration_json) THEN s.cards_narration_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM routines s, json_tree(CASE WHEN json_valid(s.cards_photo_json) THEN s.cards_photo_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM recipes s, json_tree(CASE WHEN json_valid(s.steps_images_json) THEN s.steps_images_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM recipes s, json_tree(CASE WHEN json_valid(s.original_json) THEN s.original_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.household_id, unixepoch() FROM care_log s, json_tree(CASE WHEN json_valid(s.media_json) THEN s.media_json ELSE '[]' END) t WHERE s.household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
INSERT OR IGNORE INTO media_owners (media_key, household_id, created_at) SELECT t.value, s.source_household_id, unixepoch() FROM shares s, json_tree(CASE WHEN json_valid(s.payload) THEN s.payload ELSE '[]' END) t WHERE s.source_household_id IS NOT NULL AND t.type = 'text' AND t.value GLOB '[a-z]*_[A-Za-z0-9]*' AND NOT t.value GLOB '*[^A-Za-z0-9_.-]*' AND length(t.value) <= 64;
