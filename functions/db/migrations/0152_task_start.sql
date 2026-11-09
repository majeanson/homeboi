-- 0152 — every recurring task carries its start in `at` (plans/2026-11-06-TACHE-UNIFIEE.md,
-- « align every view », 2026-11-08).
--
-- WHY. A chore made before 0032 has a recurrence and no chosen start: its `at` (the old
-- `recur_start`, moved into the spine by 0150) is NULL, and every reader read that NULL as
-- « from created_at » (`choreSchedule`). A home row with a recurrence and no `at` read the
-- same NULL as « undated ». One column, two meanings, decided by the face. From here every
-- reader reads `at` one way, for every task (functions/_lib/taskViews.ts): the start of its
-- schedule, NULL = no date. So the start the chore always had is written down, once.
--
-- THE ONE STATEMENT. A row is touched only when ALL hold:
--   · kind = 'chore'           — only the face that had the « from created_at » reading. A
--                                home row with a recurrence and no date stays undated, as it
--                                always read; a to-do never recurs.
--   · at IS NULL               — a chosen start is never overwritten (idempotent: a second
--                                run changes nothing).
--   · the recurrence is real   — exactly what `parseRecur` (_lib/recur.ts) accepts: valid
--                                JSON, an object, whose `freq` is one of the four. A malformed
--                                or « hourly » recurrence reads as a ONE-OFF, and a one-off
--                                chore given a date would turn up owed: it is left alone.
--                                `json_valid` with one argument accepts RFC 8259 text only,
--                                like JSON.parse. The `freq` is read with `json_each`, the
--                                LAST one: JSON.parse keeps the last of a duplicated key, and
--                                `json_extract` the first (the drill found it, with a row
--                                no writer makes but a hand edit could). A number, an array,
--                                'null' or a bare string is never IN the list.
-- `at = created_at` is the very value `choreSchedule` substituted, so every date a reader
-- derives (the next occurrence, what is owed, whose turn) is the same before and after.
--
-- `kind` is NOT touched. Shrinking it to `plan | upkeep | NULL` would leave a row's gestures
-- with no alias to go to: a chore's tick logs « qui a aidé » and moves the turn, a to-do's
-- « Vider » deletes it, and a chore's `at` is a UTC anchor where a to-do's is a local
-- midnight. Those are one decision away (STATE.md §3), not a clean-up.
--
-- No column added, no table rebuilt: nothing references the rows by anything but `id`.
-- Drilled in worker/taskStart.d1.test.ts (a second database at 0151, every variety, every
-- task's identity compared before and after). A copy taken before this migration restores
-- through `upgradeTasks` (_lib/restore.ts), which writes the same start.
UPDATE home_projects
   SET at = created_at
 WHERE kind = 'chore'
   AND at IS NULL
   AND json_valid(recur_json)
   AND json_type(recur_json) = 'object'
   AND (SELECT f.value FROM json_each(home_projects.recur_json) AS f WHERE f.key = 'freq' ORDER BY f.id DESC LIMIT 1)
       IN ('daily', 'weekly', 'monthly', 'yearly');
