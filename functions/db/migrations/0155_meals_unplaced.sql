-- « À placer » — the week's meals that have no day yet (Marc, 2026-11-14: « an
-- empty planning day as a first pill … plan the week without assigning a day yet,
-- say have 5 meals in there, and drag and drop easily »).
--
-- NOT meal_ideas: an idea is REUSABLE (planning it leaves it in the pool); a row
-- here is CONSUMED — dropping it on a day moves it into `meals` and it leaves this
-- bin, and dragging a planned meal back off its day moves it here. It is the same
-- meal, just not dated yet. A separate table rather than a nullable meals.date
-- because every meal reader (board, month, history, shop-the-week, AI context) is a
-- date-range scan, and a dateless row would leak into all of them as 1970.
--
-- slot: the slot it came from (a side meal dragged off a day keeps its slot when
-- dropped back); NULL = the household's hero meal. Soft text, like meals.slot.
-- Additive, forward-only, filename-locked.
CREATE TABLE meals_unplaced (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  title         TEXT NOT NULL,
  recipe_id     TEXT,              -- soft ref: the saved recipe it links to (no FK, a deleted recipe leaves the title)
  slot          TEXT,              -- NULL = the hero slot at drop time
  is_leftover   INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX meals_unplaced_household_idx ON meals_unplaced(household_id, position);
