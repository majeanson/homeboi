-- DB-7 (UNIFORMIZING Phase 2): `idempotency_keys.status` stores an HTTP status
-- INTEGER, but `status` elsewhere in the schema means workflow state (staged/resolved/
-- draft…). Rename to `status_code` so the name matches the meaning and never reads as a
-- workflow column. Forward-only; one-table internal dedup ledger (no API/JSON shape,
-- not read by the frontend). Reader updated in the same commit.
ALTER TABLE idempotency_keys RENAME COLUMN status TO status_code;
