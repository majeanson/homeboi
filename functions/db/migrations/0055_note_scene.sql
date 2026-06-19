-- Drawn fridge notes (#14) keep an editable SCENE alongside the flat PNG so a
-- drawing can be re-opened and added to losslessly (its strokes/stamps/pixels/
-- shapes survive), and adding on top never destroys what was there before. The
-- scene is a JSON blob in R2 (key here, like media_key); freed with the note.
ALTER TABLE notes ADD COLUMN scene_key TEXT;
