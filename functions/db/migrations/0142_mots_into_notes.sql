-- 0142 — Un seul « Mot » : les mots (0094) entrent dans les notes du frigo (0018).
--
-- Deux tables pour une seule idée — un papier sur le frigo, parfois adressé à quelqu'un :
-- `notes` (le frigo, sans destinataire) et `mots` (« Laisse un mot », adressé, qui attend
-- un visage). Deux cartes, deux compositeurs, deux mots à l'écran, et un glossaire qui
-- devait défendre la différence. Marc, le 2026-09-29 : on garde du mot ce qui servait —
-- le destinataire, le point « en attente » sur un visage, « Plus tard » (dont « Sa
-- fête »), ce que j'ai laissé, « Garder » vers Souvenirs, la transcription d'un vocal —
-- et on laisse les fils de réponses et « Transformer ». C'est `notes` qui grandit : la
-- capture, la boîte aux lettres, le partage vers l'app et les dessins y écrivent déjà ;
-- `mots` n'a presque aucune ligne vivante, nulle part.
--
-- Chaque colonne garde exactement le sens qu'elle avait sur `mots`. `member_id` reste
-- l'AUTEUR sur `notes` (le visage qui l'a laissé, comme avant) ; le destinataire est une
-- colonne à part, parce que les deux coexistent sur une même ligne.
ALTER TABLE notes ADD COLUMN for_member_id TEXT;  -- soft ref (members.id): the RECIPIENT; NULL = the whole Maisonnée
ALTER TABLE notes ADD COLUMN opened_at INTEGER;   -- the recipient first opened it; NULL = still waiting on their face
ALTER TABLE notes ADD COLUMN saved_at INTEGER;    -- kept on the « Souvenirs » shelf; NULL = not kept (0140's meaning)
ALTER TABLE notes ADD COLUMN surface_at INTEGER;  -- « Plus tard » / « Sa fête »: hidden until this unix second; NULL = now
ALTER TABLE notes ADD COLUMN transcript TEXT;     -- a voice note's words, filled in the background (0123's meaning)
ALTER TABLE notes ADD COLUMN updated_at INTEGER;  -- last edit or reschedule

-- The live mots come across. `author_member_id` → `member_id` (the author, as on notes),
-- `member_id` → `for_member_id` (the recipient). A reply's `reply_to` does not: threads
-- are the part that was let go. `dismissed_at` stays NULL — nothing leaves the fridge.
INSERT INTO notes (id, household_id, text, member_id, created_at, media_kind, media_key, scene_key, is_sample,
                   for_member_id, opened_at, saved_at, surface_at, transcript, updated_at)
SELECT id, household_id, text, author_member_id, created_at, media_kind, media_key, scene_key, is_sample,
       member_id, opened_at, saved_at, surface_at, transcript, updated_at
  FROM mots
 WHERE deleted_at IS NULL;

-- The table stays until a later migration drops it (forward-only: one step at a time), but
-- nothing reads it any more, and nothing it holds is live: what moved is marked gone here,
-- so a reader that was missed shows nothing rather than a second copy.
UPDATE mots SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE deleted_at IS NULL;

-- The fridge reads « surfaced, not dismissed, for this household »; the waiting dot reads
-- « addressed, unopened ».
CREATE INDEX IF NOT EXISTS notes_recipient_idx ON notes (household_id, dismissed_at, for_member_id, opened_at);
