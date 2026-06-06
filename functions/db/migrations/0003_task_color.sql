-- Per-task colour (Pip colour-coding, to match per-member colour). Additive,
-- forward-only, filename-locked. Defaults to a calm sage so every existing
-- chore has a colour until an operator picks one. Hex string like members.avatar_ref.
ALTER TABLE tasks ADD COLUMN color TEXT NOT NULL DEFAULT '#88a36f';
