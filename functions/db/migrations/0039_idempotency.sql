-- Idempotency keys — the server side of the OFFLINE WRITE QUEUE (NFR-OFFLINE-1).
-- A kiosk on flaky signal queues writes locally and REPLAYS them on reconnect; a
-- replay must not double-apply (two list items, a chore marked done twice). The
-- client stamps every queued write with a unique Idempotency-Key; authed() looks
-- it up here first and, if seen, returns the stored response instead of running
-- the handler again. Scoped per household so keys can't collide or leak across
-- accounts. Only successful (2xx) responses are recorded, so a failed write can
-- still be retried. Pruned opportunistically (keys older than ~7 days) to stay
-- small — it's a short-lived dedup ledger, not history. Additive, forward-only,
-- filename-locked.
CREATE TABLE idempotency_keys (
  household_id TEXT NOT NULL,
  key          TEXT NOT NULL,
  status       INTEGER NOT NULL,
  result_json  TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (household_id, key)
);
CREATE INDEX idempotency_keys_prune_idx ON idempotency_keys(created_at);
