-- Share-mode curated fields. Surfaced to a typed read-only share link (the
-- babysitter "handoff" and the "welcome" visitor card — see functions/_lib/auth.ts
-- GuestKind). These are the few facts a guest needs that don't already live in a
-- table: the wifi to join, the night's house rules, and the bin/recycling day.
-- Everything else a sitter sees (today's plan, bedtime routines, allergies/à-savoir,
-- emergency contacts) is READ from existing data — members.notes, contacts tagged
-- "urgence", routines, events/meals — so no new tables for those.
--
-- All nullable; empty/NULL simply means "not set" and the field hides. Plain text,
-- not an inventory or a count — nothing here trips the calm-tenets scan.
-- Additive, forward-only, filename-locked.
ALTER TABLE households ADD COLUMN wifi_ssid TEXT;
ALTER TABLE households ADD COLUMN wifi_password TEXT;
ALTER TABLE households ADD COLUMN house_rules TEXT;
ALTER TABLE households ADD COLUMN bin_day TEXT;
