-- Per-date car overrides for « L'auto » — the "schedules vary week by week" layer.
-- The weekly schedule_blocks template gives the default; for any single date the
-- household can override it in the /voiture week view in one tap, without touching
-- the template. One row per (household, car, date).
--
--   day         the LOCAL-midnight unix-seconds of the date this overrides.
--   car_id      which household car (households.cars JSON id) the override is about.
--   free        1 = the car stays HOME all day (clears the template's car windows
--               for this date). When 1, start_min/end_min/holder_id are ignored.
--   holder_id   who has the car during the override window (a member/contact key),
--               for the glance label. Optional.
--   start_min   override window start, MINUTES from local midnight.
--   end_min     override window end, minutes from local midnight.
--   label       free text shown on the day ("Marc — rendez-vous").
--
-- When a row exists for a (car, day) it REPLACES the template for that car that day
-- (a single window, or free). No counts/quantities (NFR-CALM). Additive,
-- forward-only, filename-locked.
CREATE TABLE car_day (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  car_id       TEXT NOT NULL,
  day          INTEGER NOT NULL,
  free         INTEGER NOT NULL DEFAULT 0,
  holder_id    TEXT,
  start_min    INTEGER,
  end_min      INTEGER,
  label        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX car_day_unique ON car_day (household_id, car_id, day);
