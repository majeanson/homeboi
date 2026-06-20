-- Household-level "AI on/off" switch, so an operator can turn Workers AI off for
-- the whole household (every device) from Réglages ▸ IA — capture routing, recipe
-- import/read, recap, meal suggestions and ask all fall back to their no-AI paths,
-- and the UI hides every AI affordance. Distinct from the env.AI binding being
-- ABSENT (a deployment fact): this is a deliberate household choice, stored here.
--   ai_enabled: 1 / NULL = AI may run (the default), 0 = the household switched it
--     off. NULL-as-on means existing households keep AI without a backfill.
-- Nullable, additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN ai_enabled INTEGER;
