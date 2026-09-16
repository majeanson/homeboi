-- « Mot de passe oublié » — the reset token, hashed, single-use (wave 3 of the
-- public-app plan, STATE.md §4-K, 2026-09-16).
--
-- There was NO forgot-password flow: the first stranger who forgot their password was
-- locked out forever. This is the one table the flow needs. A ROW, not a bare signed
-- token, because SINGLE-USE needs a mark (`used_at`) that a stateless HMAC cannot carry.
--
-- `token_hash` is the SHA-256 of the 32-byte token that travels in the email; the
-- plaintext exists nowhere else. A leaked database yields nothing that opens a door.
-- `email` is a SOFT ref to operators.email (no FK): an operator may vanish before the
-- row expires, and a stale reset for a gone account simply fails at redeem time.
-- 30 minutes to live (expires_at); the endpoint caps outstanding rows per email so a
-- flood of requests cannot fill the table, and the used/expired rows are cheap enough
-- to leave (a few bytes each, one per forgotten password).
--
-- Not swept by the demo sandbox (no household_id — see demoHousehold EXEMPT_TABLES).
CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,     -- soft ref: operators.email at request time (no FK)
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_password_resets_email ON password_resets (email, created_at);
