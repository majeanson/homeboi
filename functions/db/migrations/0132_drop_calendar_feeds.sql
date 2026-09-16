-- « Les calendriers » retired (2026-09-16).
--
-- 0129 added read-only ICS subscriptions (school, team, collection calendars) and 0131
-- taught them to say how long they had been failing. One day in production, Marc
-- judged the feature not needed: the household's calendar is what the household
-- types, and a feed that fills itself from someone else's URL was more machinery
-- (a nightly fetch, a TZID resolver, a materialized-occurrence cache — the one
-- sanctioned exception to `_lib/upkeep`'s « no materialized rows, no cron ») than the
-- typing it saved. With the exception gone, the rule is whole again.
--
-- Forward-only, so 0129/0131 stay as written and this DROPS what they built. Child
-- first (feed_events referenced calendar_feeds). No data anyone typed lives here:
-- every row was a cache of a fetch, refetchable from its URL — which is the same
-- reason the demo sweep never needed to seed one. The demo-sweep guard
-- (`demoHousehold.test.ts`) subtracts DROP TABLE'd names, so these two leave its
-- inventory rather than being swept from a table that no longer exists.
DROP TABLE IF EXISTS feed_events;
DROP TABLE IF EXISTS calendar_feeds;
