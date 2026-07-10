-- « Mes habitudes » ▸ « À quel rythme ? » grows two INTRA-DAY cadences beside the
-- existing 'recur' (scheduled days) and 'week' (n times per local week):
--
--   cadence = 'day'   → n times per local DAY, any moment  (the daily twin of 'week')
--   cadence = 'hours' → every N hours inside a waking window (« aux 4 h, 8 h → 20 h »)
--
-- Both come due EVERY day, so they carry no recur rule and no due_days — the
-- expectation is a COUNT within the day, not a set of dates.
--
-- `day_times` is the ONE per-day expectation both cadences read: entered directly
-- for 'day', COMPUTED server-side from the window ÷ every_hours for 'hours'. The
-- calendar (api/month) and the check-in scene therefore never re-derive a slot
-- grid to know what a day was asking for.
--
-- Calm: still a per-day observation, still no chain, no score, no comparison — a
-- rhythm of 4 says "four moments", never "you owe four".
ALTER TABLE habits ADD COLUMN day_times    INTEGER;  -- cadence 'day'|'hours': 1..24 marks the day asks for
ALTER TABLE habits ADD COLUMN every_hours  INTEGER;  -- cadence 'hours': 1..12, the spacing between moments
ALTER TABLE habits ADD COLUMN window_start INTEGER;  -- cadence 'hours': first moment, minutes past LOCAL midnight
ALTER TABLE habits ADD COLUMN window_end   INTEGER;  -- cadence 'hours': last moment allowed, minutes past LOCAL midnight
