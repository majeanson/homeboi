-- « Pas pressé » — a list line we only buy if a good deal happens to be on, and
-- otherwise ignore. Not a priority scale and not a quantity: a single opt-in flag
-- (nullable INTEGER 0/1, the `tasks.announce_evening` shape). NULL/0 = an ordinary
-- item we actually need. It changes nothing about how the line behaves — it still
-- checks off, clears, logs a buy and takes a flyer deal — only how it READS on the
-- list, so a shopper's eye skips it when there's no aubaine.
--
-- Additive, forward-only, filename-locked.
ALTER TABLE list_items ADD COLUMN non_urgent INTEGER;
