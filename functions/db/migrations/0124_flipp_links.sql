-- « Lier Flipp » — the household's Flipp account, so Babillard can write its list
-- (deals WITH their clipping) straight into the Flipp app (2026-09-10).
--
-- Why a table at all: Flipp exposes no public API and no OAuth. The only way a deal
-- reaches the app without a tap per item is their accounts API — the same
-- `PUT /v1/users/{id}/shopping_lists/{list}` their web page calls — with the
-- session Flipp keeps in its own cookies. The bookmark (lib/flippList) hands that
-- session to Babillard ONCE, by the household's own choice, and « Délier » deletes
-- this row. Marc decided the trade for his household knowing the costs (STATE.md):
-- we hold a credential to a third-party account, their API is private and may
-- move, and it is outside what Flipp exposes on purpose.
--
-- The token is stored ENCRYPTED (functions/_lib/secretBox, AES-GCM keyed from
-- SESSION_SECRET) — a database read alone yields nothing usable. One row per
-- household (a maisonnée has one Flipp list to feed); `flipp_user_id` and
-- `list_id` are Flipp's identifiers, soft refs to THEIR system — no FK, of course.
-- `last_push_at` / `last_error` are what the Réglages card shows: when it last
-- worked, and what Flipp said when it did not (a moved API surfaces here first).
CREATE TABLE flipp_links (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  flipp_user_id TEXT NOT NULL,          -- Flipp's user id (theirs, soft)
  access_token_enc TEXT NOT NULL,       -- secretBox ciphertext of their access token
  list_id TEXT,                         -- Flipp's shopping-list id (theirs, soft); NULL = fetch on first push
  email TEXT,                           -- what the card shows: which Flipp account this is
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_push_at INTEGER,
  last_error TEXT
);
