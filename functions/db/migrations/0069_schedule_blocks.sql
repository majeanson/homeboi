-- Work / recurring-schedule blocks for « L'auto » — the quiet weekly backdrop that
-- shapes when the shared car is spoken for. Each row is one member's recurring
-- weekly window (e.g. "Marc · travail · Lun–Ven 8h–17h · prend l'auto"). These are
-- NOT agenda events — they never appear as board Acts; they only feed the car
-- availability resolver (free gaps + conflicts) and a derived "who's home" glance.
--
--   member_id   whose schedule this is.
--   label       free text ("Travail", "Garderie") — shown in the /voiture view.
--   start_min   window start, MINUTES from local midnight (0..1440).
--   end_min     window end,   minutes from local midnight (> start_min).
--   weekdays    JSON array of weekday numbers it repeats on, 0=Sun … 6=Sat.
--   holds_car   1 = this person TAKES the car during the window (so the car is
--               unavailable to everyone else then). 0 = just a presence/away block
--               (feeds "who's home" but leaves the car at home).
--   color       optional tint for the /voiture timeline.
--
-- A weekly TEMPLATE; a single odd week is overridden per-date in `car_day`
-- (migration 0070). Minutes/weekdays only — no counts (NFR-CALM). Additive,
-- forward-only, filename-locked.
CREATE TABLE schedule_blocks (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id    TEXT NOT NULL REFERENCES members(id),
  label        TEXT,
  start_min    INTEGER NOT NULL,
  end_min      INTEGER NOT NULL,
  weekdays     TEXT NOT NULL DEFAULT '[]',
  holds_car    INTEGER NOT NULL DEFAULT 1,
  color        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX schedule_blocks_household_idx ON schedule_blocks (household_id);
