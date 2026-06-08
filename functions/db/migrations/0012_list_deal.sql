-- The "show the cashier" set now lives ON the shared list: a staged flyer deal is
-- stored against its grocery line as JSON. So picks sync across every device (it
-- rides the board read) and clear automatically when the item is checked off —
-- no separate per-device picks store. Nullable (most lines carry no deal).
-- Additive, forward-only, filename-locked.
ALTER TABLE list_items ADD COLUMN deal_json TEXT;
