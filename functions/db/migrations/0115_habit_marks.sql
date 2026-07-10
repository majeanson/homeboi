-- « Le défi du jour » — per-face check-ins on ONE shared, day-long family goal
-- (« porte du jaune », « salue une nouvelle personne »). The défi itself is a
-- standing `habits` row (kind='defi', member_id NULL = the whole maisonnée); the
-- day's chosen défi text rides that habit's `habit_days.note` (one row per local
-- day, no new column). This table is the ONLY new shape: who, of the household,
-- tried today's défi — the task_participants pattern, per-face and count-free.
--
-- CALM (NFR-CALM-1, the chore-ledger rule): a mark is a FACE, never a tally. No
-- streak, no points, no rank, no per-member score — a day nobody marked simply has
-- no row and reads as neutral, exactly like habit_days. Re-rolls of the morning
-- pige are client-side only and never land here.
CREATE TABLE habit_marks (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL REFERENCES habits(id),
  day        INTEGER NOT NULL,             -- household-LOCAL midnight unix seconds (the habit_days convention)
  member_id  TEXT REFERENCES members(id),  -- WHO tried it today (author = subject; soft ref, kept if the member goes)
  note       TEXT NOT NULL DEFAULT '',     -- optional « comment c'était » (unused for now; kept for the future peek)
  created_at INTEGER NOT NULL,
  UNIQUE (habit_id, day, member_id)        -- one mark per face per day (a second tap is a no-op, not a count)
);
CREATE INDEX habit_marks_idx ON habit_marks(habit_id, day);
