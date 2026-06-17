-- Rich fridge notes (#38 audio memos + #14 drawn notes). A note can now carry an
-- optional media attachment alongside (or instead of) its text: a recorded audio
-- memo or a finger/stylus drawing, both stored in R2 and served via /api/img/<key>.
-- Additive, forward-only, filename-locked. media_kind is 'audio' | 'drawing'
-- (NULL = a plain text note, the existing behaviour). media_key is the R2 object
-- key. text stays NOT NULL but is '' for a media-only memo.
ALTER TABLE notes ADD COLUMN media_kind TEXT;
ALTER TABLE notes ADD COLUMN media_key TEXT;
