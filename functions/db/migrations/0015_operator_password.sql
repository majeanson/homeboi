-- Per-account passwords for self-serve signup.
--
-- Nullable on purpose: rows created before this migration (or via the legacy
-- first-login path) have no hash and keep authenticating through the shared
-- LOGIN_PASSWORD gate — nothing breaks for an existing deployment. New accounts
-- created by /api/auth/signup store a PBKDF2 hash here (see _lib/password.ts).
ALTER TABLE operators ADD COLUMN password_hash TEXT;
