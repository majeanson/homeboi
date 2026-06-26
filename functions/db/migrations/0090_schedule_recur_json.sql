-- DB-4 (P2-2): converge « L'auto » schedule_blocks recurrence onto the ONE engine.
--
-- Until now a block stored its recurrence as TWO bespoke columns — `weekdays` (a JSON
-- array) + `week_interval` (every-N-weeks) — so `_lib/recur` (which every recurring
-- EVENT already uses) couldn't serve it; carResolve carried a parallel `weekActive`
-- copy of the same fortnight math. Fold both columns into a single `recur_json`
-- holding a weekly Recur rule {freq,interval,weekdays} — byte-identical to what events
-- store — so the resolver drives off `recur.occurrenceOn` and the duplication is gone.
--
-- `anchor_day` (the fortnight-phase reference, migration 0073) STAYS — it's the recur
-- anchor now. The API contract is unchanged: /api/schedule still speaks `weekdays` /
-- `weekInterval` / `anchorDay` to the client (the handler parses ⇄ builds recur_json),
-- so the /voiture editor needs no change.
--
-- Backfill is exact (json_object with json(weekdays) nesting the array, not a string),
-- then the now-redundant columns are dropped. Forward-only, filename-locked.
ALTER TABLE schedule_blocks ADD COLUMN recur_json TEXT NOT NULL DEFAULT '{}';
UPDATE schedule_blocks
   SET recur_json = json_object('freq', 'weekly', 'interval', week_interval, 'weekdays', json(weekdays));
ALTER TABLE schedule_blocks DROP COLUMN weekdays;
ALTER TABLE schedule_blocks DROP COLUMN week_interval;
