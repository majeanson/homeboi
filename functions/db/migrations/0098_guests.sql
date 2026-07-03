-- Guest share-links, so an operator can REVOKE a leaked/over-shared link before its
-- signed TTL (REVIEW-PASS §509). Guest tokens are stateless HMAC capabilities (auth.ts
-- issueGuestToken: `{g,h,k,x}`), so validity was "the signature + expiry alone, no DB
-- row" — nothing to kill early. This table gives each minted link a row keyed by its
-- token id (`g`), which resolveActor now checks: a row with revoked_at set makes the
-- token dead at once (a token with NO row is a legacy pre-migration link, still honoured
-- until it expires — never regressed). Mirrors devices.revoked_at.
--   id           = the token's guestId (the `g` claim) — the revocation key.
--   household_id = the tenant this link reads (mirrors mots: a plain households FK).
--   kind         = the GuestKind discriminator (showcase|sitter|welcome|family|intake|postbox).
--   target_key   = intake only: the addressed person key (member:<id>/contact:<id>), for the list UI.
--   expires_at   = the signed TTL, mirrored here so the operator list can show/sweep it.
--   revoked_at   = set to kill the link early; live (still-valid) links have it NULL.
-- Forward-only.
CREATE TABLE guests (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  kind          TEXT NOT NULL,
  target_key    TEXT,                         -- intake: addressed person key; NULL otherwise
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,             -- signed TTL, mirrored for the list + sweep
  revoked_at    INTEGER                       -- killed early; live set = NULL
);
-- The operator's "active links" list: this household's still-live links, newest first.
CREATE INDEX guests_household_idx
  ON guests(household_id, revoked_at, expires_at, created_at);
