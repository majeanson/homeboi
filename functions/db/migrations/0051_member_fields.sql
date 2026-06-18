-- Richer member profiles: contact info, birthday, and notes for household faces.
-- These mirror the equivalent fields on contacts so a member can carry the same
-- structured data as a cercle contact. All nullable — existing rows get NULLs.
ALTER TABLE members ADD COLUMN email TEXT;
ALTER TABLE members ADD COLUMN phone TEXT;
ALTER TABLE members ADD COLUMN birthday TEXT; -- 'YYYY-MM-DD' ('0000-MM-DD' year unknown)
ALTER TABLE members ADD COLUMN notes TEXT;
ALTER TABLE members ADD COLUMN gender TEXT; -- 'm' | 'f' | null
