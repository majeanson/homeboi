-- « Mes habitudes » — gentle personal/household rhythms with a daily check-in
-- scene (the « Avant de partir » of self-care). History is APPEND-ONLY per-day
-- observation rows; any progress shown is DERIVED at read time. No score is
-- stored, no member is ever compared to another. Member-owned habits are
-- private-ish: filtered client-side by the picked face (the mots precedent),
-- not ACL'd — the household shares one roof and one API.
CREATE TABLE habits (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL REFERENCES households(id),
  member_id      TEXT REFERENCES members(id),   -- OWNER; NULL = whole maisonnée (soft ref: kept if the member goes)
  title          TEXT NOT NULL,
  icon           TEXT NOT NULL DEFAULT '',      -- emoji picto (content, not a control affordance)
  colour         TEXT,
  kind           TEXT NOT NULL DEFAULT 'do',    -- 'do' | 'count' (toward a target) | 'limit' (soft ceiling) | 'avoid' (held / slip)
  target         INTEGER,                       -- count: per-day goal; limit: the soft ceiling; NULL otherwise
  unit           TEXT NOT NULL DEFAULT '',      -- « verres », « pas », « cigarettes »…
  cadence        TEXT NOT NULL DEFAULT 'recur', -- 'recur' (scheduled days via recur_json) | 'week' (n fois par semaine, any days)
  recur_json     TEXT,                          -- cadence='recur': shared Recur JSON (_lib/recur); NULL = every day
  week_times     INTEGER,                       -- cadence='week': 1..7 times per local week
  anchor_at      INTEGER NOT NULL,              -- recurrence anchor (creation instant; occurrences never precede it)
  reminders_json TEXT NOT NULL DEFAULT '[]',    -- in-app reminder times as minutes past LOCAL midnight, e.g. [540,840,1200]
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER,
  archived_at    INTEGER,                       -- resting habit: kept with its history, off the sheet (reversible, like carnets)
  deleted_at     INTEGER
);
CREATE INDEX habits_household_idx ON habits(household_id, deleted_at, archived_at, position);

-- One row per habit per LOCAL day someone touched it — this IS the history.
-- day = localDayStart (household-local midnight, DST-aware, like routine_runs).
-- Unlike routine_runs these rows are KEPT (the fuller-history choice): an
-- untouched day simply has no row, which reads as neutral — never a failure.
CREATE TABLE habit_days (
  id         TEXT PRIMARY KEY,
  habit_id   TEXT NOT NULL REFERENCES habits(id),
  day        INTEGER NOT NULL,             -- local-midnight unix seconds
  value      INTEGER NOT NULL DEFAULT 0,   -- do/avoid-held: 0|1; count/limit: the day's ABSOLUTE total (never a delta)
  slips      INTEGER NOT NULL DEFAULT 0,   -- avoid only: the day's gentle slip log
  member_id  TEXT REFERENCES members(id),  -- who LAST touched it (author attribution, soft ref: kept if the member goes)
  note       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  UNIQUE (habit_id, day)
);
CREATE INDEX habit_days_idx ON habit_days(habit_id, day);
