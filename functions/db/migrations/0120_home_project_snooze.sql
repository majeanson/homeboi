-- « Reporter » — postpone an owed/due entretien without checking it off and
-- without letting it disappear. snoozed_until (unix sec, local-midnight day) is
-- the day the row wakes back up: until then it stays quiet on « À faire » / the
-- season card (functions/_lib/upkeep.ts suppresses dueToday/overdueSince), then
-- it simply returns. NULL = not postponed. Completing the row clears it (a
-- stale snooze must never mute the NEXT cycle). Derived on read, no new rows —
-- the calm sibling of the overdue carry-forward (0119).
ALTER TABLE home_projects ADD COLUMN snoozed_until INTEGER;
