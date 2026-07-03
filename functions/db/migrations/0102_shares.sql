-- « Partager » — ONE snapshot-share rail for every kind. Generalizes 0100
-- (family_shares) so a recipe, a rendez-vous, or a kid routine can be handed to a
-- friend the same way a family already can: a one-time COPY parked under an
-- unguessable id that IS the share capability, expiring + revocable — never a
-- cross-household live link (that's « Voyage partagé », 0101, a different model).
--
-- The sender POSTs (or the server materializes) a JSON snapshot; we store it here
-- and hand back a /partage/<id> URL that opens a public read-only page. A signed-in
-- Babillard visitor can COPY the snapshot into their own account (add the recipe to
-- their book, the event to their agenda…); a signed-out visitor sees it + a « join »
-- CTA. Family stays richer (third-party PII) and keeps its signed-in-only merge at
-- /cercle/import — see functions/api/share-public.ts for the family teaser carve-out.
--
--   id                  = the unguessable share id (newId) — the capability in the URL.
--   source_household_id = who created it (soft tenant scope; the list/revoke owner).
--   kind                = 'family' | 'recipe' | 'event' | 'routine' (the snapshot sub-type).
--   label               = a human title for the sender's « Mes partages » manage list.
--   payload             = JSON snapshot; any media key inside is a SHARE-OWNED R2 copy
--                         (prefix `sh`, or legacy `fs` on rows migrated from 0100), so the
--                         snapshot survives the source row/photo being deleted.
--   expires_at          = a TTL (still expiring, never permanent); family 30 d, content ~1 an.
--   revoked_at          = set to kill the share early; live shares have it NULL.
--
-- Plain text, no count/quantity/score/streak column — nothing here trips the calm-tenets
-- scan (calm-tenets.test.ts). Additive, forward-only, filename-locked.
CREATE TABLE shares (
  id                  TEXT PRIMARY KEY,
  source_household_id TEXT NOT NULL REFERENCES households(id),
  kind                TEXT NOT NULL,
  label               TEXT NOT NULL DEFAULT '',
  payload             TEXT NOT NULL DEFAULT '{}',
  expires_at          INTEGER,
  revoked_at          INTEGER,
  created_at          INTEGER NOT NULL
);

-- The sender's « Mes partages » list: this household's still-live shares, newest first.
CREATE INDEX shares_source_idx
  ON shares(source_household_id, revoked_at, created_at);

-- Fold the existing family shares (0100) onto the same rail, ids PRESERVED so every
-- /cercle/import?s=<id> link already texted to a friend keeps resolving. Then drop the
-- old table — family-share.ts is rewired to read `shares WHERE kind='family'` in the
-- same change, with byte-identical response shapes (the UI never notices).
INSERT INTO shares (id, source_household_id, kind, label, payload, expires_at, revoked_at, created_at)
  SELECT id, source_household_id, 'family', label, payload, expires_at, revoked_at, created_at
  FROM family_shares;

DROP TABLE family_shares;
