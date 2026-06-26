-- A short, TV-typeable code for a DISPLAY device, so a living-room TV opens the board
-- via babillard…/tv/<code> instead of the long /cast?display=<token> URL nobody can type
-- on a TV remote. /tv/<code> (worker/index.ts) looks the code up, re-mints a fresh
-- read-only display token on the fly (revocable by deviceId, like any device), and 302s
-- to /cast — so the raw token is never stored. cast_scene remembers whether the operator
-- set this TV to the full board or the ambient screensaver. Both NULL on existing rows
-- (kiosks + pre-0084 displays keep working via the long link). Forward-only.
ALTER TABLE devices ADD COLUMN short_code TEXT;
ALTER TABLE devices ADD COLUMN cast_scene TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_short_code ON devices(short_code);
