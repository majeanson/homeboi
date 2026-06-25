-- A device can be a normal KIOSK (board-scoped read/write wall tablet) or a read-only
-- DISPLAY — a living-room TV that shows /cast forever. A display is minted directly by
-- the operator (no 6-digit pairing code; a TV remote can't type), is read-only (the
-- guard lives in functions/_lib/route.ts: kiosk + kind='display' → non-GET 403), and is
-- revoked from the SAME paired-devices list (revoked_at). Existing rows are kiosks.
-- Forward-only; do not edit once applied.
ALTER TABLE devices ADD COLUMN kind TEXT NOT NULL DEFAULT 'kiosk';
