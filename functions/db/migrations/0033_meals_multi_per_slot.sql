-- A slot can now hold SEVERAL meals (e.g. two dishes for dîner, two snacks),
-- not just one. The old one-per-slot rule lived in the unique index added by
-- 0014; lifting it lets a day+slot carry a list. `position` gives an explicit
-- intra-slot order so the list can be reordered (↑/↓) and reads back stable.
--
-- Existing rows (at most one per slot today) all take position 0 — already
-- unique within their slot; appends compute MAX(position)+1, and every read
-- breaks ties on created_at,id so the order never reshuffles on a kiosk poll.
-- Additive + a constraint relaxation; forward-only, filename-locked.
ALTER TABLE meals ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Drop the one-per-(household,date,slot) rule — multiple meals per slot is the
-- whole point now. (Was the atomicity guard for suggest/replace; both paths now
-- just append, so the guard is no longer needed.)
DROP INDEX IF EXISTS meals_day_unique;

-- Non-unique replacement so the day-window scan and per-slot MAX(position) on
-- append stay indexed.
CREATE INDEX meals_day_idx ON meals(household_id, date, slot, position);
