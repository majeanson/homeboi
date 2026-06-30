-- « Laisse un mot » — two follow-ups to the mots feature (migration 0094):
--   surface_at — SCHEDULE a mot: it stays hidden from the recipient's inbox + their face
--                dot until this moment (NULL = surface immediately). The inverse of the
--                events « Bientôt » lead — "don't show until". Stored as a unix second.
--   reply_to   — REPLY threading: this mot answers another one. A soft self-ref (no
--                cascade, modelled on carnets.parent_id) — NULL = a top-level mot. A reply
--                is just a normal mot back to the original sender, so nothing else changes.
-- Both additive, forward-only, filename-locked.
ALTER TABLE mots ADD COLUMN surface_at INTEGER;             -- NULL = surface now; else hide until this unix second
ALTER TABLE mots ADD COLUMN reply_to TEXT REFERENCES mots(id); -- the parent mot this answers; NULL = top-level (soft ref)
CREATE INDEX mots_reply_idx ON mots(reply_to);
