-- « Le pont », version minimale (D-18, bmad/10) — named, standing, revocable guests.
-- A guest link is normally stateless-with-a-short-TTL (the token itself IS the whole
-- capability, §509's `guests` row only lets it be killed EARLY). A STANDING link
-- flips that: it carries a 10-year backstop expiry (auth.ts STANDING_TTL) but is
-- DB-REQUIRED — resolveActor (household.ts guestRowAcceptable) accepts a standing
-- token ONLY when this row exists AND revoked_at IS NULL, so revocation becomes the
-- link's real kill switch instead of a decorative extra. guest/start.ts's insert for
-- a standing mint is therefore MANDATORY (500s on failure) — never hand out a
-- standing token with no row to revoke.
--   standing = 1 for a durable link (any GuestKind may be standing — decided);
--              0 (default) = the existing short-TTL behaviour, row stays optional.
--   label    = the operator's "Pour qui ?" name at mint (« Mamie », « Rosalie la
--              gardienne ») — required when standing=1, so "Liens actifs" can name it.
--   lang     = per-guest locale (E-38) — 'fr' | 'en' | NULL (household default);
--              appended to the minted URL as &lang= and read once at boot.
-- Forward-only.
ALTER TABLE guests ADD COLUMN standing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guests ADD COLUMN label TEXT;
ALTER TABLE guests ADD COLUMN lang TEXT;
