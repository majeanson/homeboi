-- Ghost list — predictive grocery suggestions. Additive, forward-only,
-- filename-locked (never rename once applied). Two tables:
--
--   purchase_log — append-only history: one row each time a list item is
--   checked off (bought). item_key is the normalized name (see _lib/normalize),
--   so "Œufs", "oeufs" and "2 douzaines d'œufs" all group together. This is the
--   raw signal for frequency ("top picked through time") and the learned renewal
--   cadence (median interval between buys). It is history/attribution only —
--   NOT a score: no streak, no hoardable count lives here (NFR-CALM-1).
--
--   ghost_items — SPARSE user overrides on top of the code-defined staples
--   (_lib/ghostStaples). Empty by default; a row appears only when the operator
--   tunes a cadence, mutes an item, or adds a custom staple. The base staples
--   are NOT seeded as rows — they live in code and are merged at read time, so
--   there are no stale seed rows to maintain.
--
-- No backfill of existing checked list_items: SQLite lower() can't reproduce the
-- TS normalizer (accent/ligature folding), so backfilled keys would diverge from
-- live ones and split a single item into two ghosts. History accrues going
-- forward instead — clean keys, one writer.

CREATE TABLE purchase_log (
  id           TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  item_key     TEXT NOT NULL,
  text         TEXT NOT NULL,
  purchased_at INTEGER NOT NULL
);
CREATE INDEX purchase_log_hh_key_idx ON purchase_log(household_id, item_key, purchased_at);

CREATE TABLE ghost_items (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  item_key      TEXT NOT NULL,
  label         TEXT NOT NULL,
  cadence_days  INTEGER,
  muted         INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'manual', -- 'manual' (operator-added) | 'override' (tuned a staple/learned key)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (household_id, item_key)
);
CREATE INDEX ghost_items_hh_idx ON ghost_items(household_id);
