-- Day notes — a free-text memo pinned to ONE day of the meal week (La cuisine).
-- Unlike fridge notes (table `notes`, household-level, transient and dismissable
-- from the wall), a day note belongs to a specific calendar day: "rendez-vous
-- dentiste après l'école", "Léa dort chez mémé". It rides under that day in the
-- kitchen grid and surfaces on the Aujourd'hui board for today, beside the day's
-- meals.
--
-- One memo per household per day — you edit it, it's not a feed. The unique index
-- enforces that and makes the upsert (POST → ON CONFLICT) atomic across devices.
-- `date` is the local-midnight unix second of the day, same bucketing as meals.
-- Additive, forward-only, filename-locked.
CREATE TABLE day_notes (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  date          INTEGER NOT NULL,
  text          TEXT NOT NULL,
  member_id     TEXT REFERENCES members(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX day_notes_day_unique ON day_notes(household_id, date);
