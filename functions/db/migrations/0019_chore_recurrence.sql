-- Chores can now recur ("les poubelles, tous les jeudis"). Same rule shape as
-- events (functions/_lib/recur: {freq,interval?,weekdays?}), stored as JSON.
-- The chore's created_at is the recurrence ANCHOR (the board expands the series
-- from there forward), so no new anchor column is needed. NULL = a standing
-- chore with no schedule (the pre-existing behaviour — shown in the per-person
-- lanes, never auto-surfaced on Aujourd'hui).
--
-- Additive, forward-only, filename-locked.
ALTER TABLE tasks ADD COLUMN recur_json TEXT;
