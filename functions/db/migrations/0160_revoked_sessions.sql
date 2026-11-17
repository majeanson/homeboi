-- « Se déconnecter » ends THIS session on the server too (review 2026-11-17, P0 #7).
--
-- Logout only cleared the browser's cookies: a copied `bb_session` stayed valid for its
-- thirty days unless the owner found « Se déconnecter partout », which ends every other
-- device as well (session_version, 0134). One row per session that signed out:
-- currentOperator (_lib/auth.ts) refuses a cookie whose hash is here, in the same read
-- that checks its version, so it costs no extra round trip.
--
-- token_hash: sha256 of the whole signed cookie value — never the cookie itself.
-- expires_at: when the cookie would have died anyway; the nightly cron deletes the row
--   after that, so the table only ever holds sessions that could still be replayed.
-- Keyed by session, not household (an operator row is keyed by email, 0133's shape).
CREATE TABLE revoked_sessions (
  token_hash  TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);
