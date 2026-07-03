-- « Partager une famille » — hand a family you built in Le cercle to a FRIEND who
-- runs their own Babillard household. A "family" isn't a stored row: it's a subgraph
-- derived at read time (Union-Find over contact_links, src/lib/cercle.ts). So sharing
-- one MATERIALIZES a snapshot of that subgraph (people + relationship edges + pets,
-- index-addressed exactly like an intake submission — see functions/_lib/intake.ts
-- IntakeSubmission) and parks it HERE, keyed by an unguessable id that IS the share
-- capability. The recipient, signed into their OWN account, reads the snapshot by id
-- and MERGES it into their own cercle via the existing /api/cercle* endpoints (the
-- same ReviewChecklist + matchIntakePerson + « Compléter les familles » flow intake
-- uses). This is a one-time COPY — no cross-household live link, no operator→operator
-- grant table (the one-household model stays intact).
--
--   id                  = the unguessable share id (newId) — the capability in the URL.
--   source_household_id = who created the share (soft tenant scope; the list/revoke owner).
--   label               = a human title for the sender's manage list ("Famille Tremblay").
--   payload             = JSON { self, household[], links[], pets[] } (see _lib/intake.ts);
--                         photo keys inside are SHARE-OWNED R2 copies (prefix `fs`), so the
--                         snapshot survives the source contact being deleted.
--   expires_at          = a TTL (still expiring, never permanent), mirrored for the sweep.
--   revoked_at          = set to kill the share early; live shares have it NULL.
--
-- Plain text, no count/quantity/score/streak column — nothing here trips the calm-tenets
-- scan (calm-tenets.test.ts). Additive, forward-only, filename-locked.
CREATE TABLE family_shares (
  id                  TEXT PRIMARY KEY,
  source_household_id TEXT NOT NULL REFERENCES households(id),
  label               TEXT NOT NULL DEFAULT '',
  payload             TEXT NOT NULL DEFAULT '{}',
  expires_at          INTEGER,
  revoked_at          INTEGER,
  created_at          INTEGER NOT NULL
);

-- The sender's "shared families" list: this household's still-live shares, newest first.
CREATE INDEX family_shares_source_idx
  ON family_shares(source_household_id, revoked_at, created_at);
