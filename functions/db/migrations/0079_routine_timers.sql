-- Server-persisted per-step countdown timers for kid routines. A step can carry a
-- tap-to-start countdown (e.g. brush teeth for 2 min). Until now it lived only in
-- the player's React state, so leaving the app and coming back reset it. We store
-- the timer state PER card on today's run row as JSON: { "<cardIdx>": {endsAt} } for
-- a running/finished timer (endsAt = unix seconds it hits zero — remaining is derived
-- from wall-clock on read, so it stays real across an app restart) or { "<cardIdx>":
-- {left} } for a paused one (seconds remaining). Cleared with the day's run on
-- "Recommencer" (the row is deleted). NOT a score or streak — just a live clock.
ALTER TABLE routine_runs ADD COLUMN timers_json TEXT;
