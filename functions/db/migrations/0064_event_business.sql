-- Link a rendez-vous to a « Le cercle » Business (0063). An event's "who" becomes
-- one-of member_id / contact_id / business_id (mutually exclusive, enforced in the
-- events handler). Forward-only, nullable — existing events keep member/contact.
ALTER TABLE events ADD COLUMN business_id TEXT;
