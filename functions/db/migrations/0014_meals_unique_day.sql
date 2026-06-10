-- One supper per household per day, enforced by the schema.
--
-- The suggest path (kid picks a meal) used to SELECT-then-INSERT — two devices
-- racing could both pass the empty-slot check and double-book the day. With a
-- unique index the handler becomes INSERT OR IGNORE (suggest) and an atomic
-- DELETE+INSERT batch (parent set), and the race disappears.

-- Clear any duplicates that already snuck in (keep the newest row per day —
-- the latest decision wins, matching the parent "replace" semantics).
DELETE FROM meals WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM meals GROUP BY household_id, date, slot
);

CREATE UNIQUE INDEX meals_day_unique ON meals(household_id, date, slot);
