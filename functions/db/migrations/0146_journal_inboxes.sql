-- 0146 — « Mon journal » : l'adresse courriel privée par laquelle une page écrite à la
-- main entre dans « Les notes ».
--
-- Marc tient un journal À LA MAIN (un e-writer, du papier), mais le veut cherchable par
-- mots-clés et par date. La chaîne : on écrit sur l'appareil, l'appareil convertit le
-- manuscrit en texte CHEZ LUI (fr_CA, hors ligne, gratuit), puis « envoyer par
-- courriel » vers l'adresse d'ici → Cloudflare Email Routing → le handler email() du
-- Worker → une ligne `family_notes` datée. Aucune table de journal : une entrée EST une
-- note de membre, donc la recherche est héritée (SEARCH_INDEX.familyNote).
-- Le plan complet : plans/JOURNAL-EWRITER.md.
--
-- POURQUOI UNE TABLE PLUTÔT QU'UN JETON HMAC. Le premier jet voulait une adresse
-- sans état, sur le modèle de issueGuestToken : `jrnl-<jeton signé>@zone`. Ça ne
-- rentre pas. La partie locale d'une adresse courriel est bornée à 64 caractères, et
-- un jeton d'ici — b64url(JSON) + '.' + b64url(HMAC-SHA256) — en fait ~124 à lui seul.
-- D'où une ligne : l'adresse porte un id court, et c'est la table qui dit à quelle
-- maisonnée et à quel visage il appartient.
--
-- Et c'est mieux ainsi, pas seulement plus court : une adresse qui fuit se RÉVOQUE
-- (`revoked_at`), là où un jeton signé ne peut pas l'être sans faire tourner
-- SESSION_SECRET — ce qui déconnecterait du même coup toutes les sessions et tous les
-- appareils appariés.
--
-- L'ID EST EN MINUSCULES, et ce n'est pas cosmétique : beaucoup de serveurs de courriel
-- normalisent la partie locale en minuscules en chemin. Un id à casse mixte (ALPHABET
-- de newId) ne se retrouverait plus à l'arrivée. D'où `newShortCode(16)` — son
-- alphabet de 31 symboles est minuscules + chiffres sans sosies, soit ~79 bits sur
-- 16 caractères : impossible à devimer, et intact quelle que soit la casse reçue.
CREATE TABLE journal_inboxes (
  id            TEXT PRIMARY KEY,                      -- le suffixe de l'adresse : newShortCode(16), minuscules
  household_id  TEXT NOT NULL REFERENCES households(id),
  -- Portée : DE QUI est ce journal. Réf membre souple, sans FK, pour que supprimer un
  -- visage ne fasse jamais disparaître ses entrées (règle d'attribution du schéma).
  -- NULL = le journal de la Maisonnée.
  member_id     TEXT,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER                                -- révocation douce (NULL = vivante)
);

-- UNE boîte vivante par visage. COALESCE parce que SQLite tient deux NULL pour
-- distincts : sans ça, la Maisonnée (member_id NULL) pourrait en accumuler plusieurs.
CREATE UNIQUE INDEX journal_inboxes_one_live_idx
  ON journal_inboxes(household_id, COALESCE(member_id, ''))
  WHERE revoked_at IS NULL;

CREATE INDEX journal_inboxes_household_idx ON journal_inboxes(household_id, revoked_at);
