-- The demo sweep keys on a FLAG, not on an email (review 2026-11-17, P0 #3).
--
-- The sweep, the cap and the nightly stale count used to find a sandbox by its
-- operator's email (`demo-%@babillard.invalid`) and nothing else. An email is
-- something a person types: signup and operator-join did not refuse that domain, so a
-- co-parent who joined a real household with such an address put the WHOLE household
-- in the next mint's sweep. The doors now refuse every `.invalid` address
-- (`isReservedEmail`), and the sweep reads this column, which only the mint sets
-- (functions/api/demo.ts) and « Garder ma maisonnée » clears (demo/claim.ts). A
-- restore never copies it (HOUSEHOLD_KEEP, _lib/restore.ts): it is identity, like tier.
--
-- Not a preference, so it does not go to household_preferences.
-- Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN is_sandbox INTEGER NOT NULL DEFAULT 0;

-- The sandboxes alive today: a household whose every operator is a sandbox throwaway.
-- A household with even one real operator is never marked — it is the case this
-- migration exists to protect.
UPDATE households SET is_sandbox = 1
WHERE EXISTS (SELECT 1 FROM operators o WHERE o.household_id = households.id AND o.email LIKE 'demo-%@babillard.invalid')
  AND NOT EXISTS (SELECT 1 FROM operators o WHERE o.household_id = households.id AND o.email NOT LIKE 'demo-%@babillard.invalid');
