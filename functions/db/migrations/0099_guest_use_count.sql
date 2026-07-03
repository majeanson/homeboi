-- Per-token flood cap for the writable guest kinds (REVIEW-PASS §509). Revocation
-- (0098) lets an operator kill a leaked link; this bounds how much damage ONE token
-- can do BEFORE it's noticed + revoked: each intake/postbox submit + media upload
-- atomically bumps this counter (see _lib/guestRate.chargeGuestUse), and the write is
-- refused (429) once it passes the cap. Distinct from the per-HOUSEHOLD MAX_PENDING
-- queue cap: this pins a single link. Legacy tokens (no guests row) stay uncapped —
-- they expire within their short TTL anyway. Forward-only.
ALTER TABLE guests ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
