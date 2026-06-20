-- Events assignable to a « Le cercle » contact (#21), not just a household member.
-- "Mamie visits", "appel chez le dentiste (Dr Roy)" — the who is someone in the
-- directory, not a Maisonnée face. Nullable, mutually exclusive with member_id in
-- the UI (an event is for a member OR a contact OR nobody). No FK so a deleted
-- contact just leaves the event unassigned rather than cascading it away.
ALTER TABLE events ADD COLUMN contact_id TEXT;
