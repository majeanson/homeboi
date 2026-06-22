-- Ride fields on events, for « L'auto » (#28 carpool / single-car coordination). A
-- ride is just an event that touches the car, so we extend events rather than add a
-- parallel table — the recurrence engine, the board/day expansion, and the
-- driver attribution (member_id = we drive · contact_id = a carpool parent drives ·
-- business_id = a rendez-vous) all come for free.
--
--   car_id      which household car (households.cars JSON id) this trip takes.
--               NULL = doesn't need OUR car (a carpool partner's car, the bus, on
--               foot). ONLY car_id-set rides are counted against car availability /
--               drive the conflict glance. Not an FK (cars are a JSON config); a
--               dangling id after a car is deleted simply reads as "no car".
--   passengers  JSON array of member ids riding along (which kids). NULL/[] = none
--               named. A list of references, never a count (NFR-CALM).
--
-- Both nullable so every existing event stays a valid non-ride. Additive,
-- forward-only, filename-locked.
ALTER TABLE events ADD COLUMN car_id TEXT;
ALTER TABLE events ADD COLUMN passengers TEXT;
