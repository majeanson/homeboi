-- A routine's moment of the day: 'morning' | 'afternoon' | 'evening', NULL =
-- anytime. A presentation cue, not a lock: the kid view surfaces the matching
-- routine first at that time of day (morning shows Matin first), nothing is
-- hidden or gated. Nullable so existing routines stay "anytime" until a parent
-- tags them in Réglages.
ALTER TABLE routines ADD COLUMN time_of_day TEXT;
