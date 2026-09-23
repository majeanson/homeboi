-- 0138 — « Ce courriel existe-t-il vraiment ? » (STATE.md §4-K Wave 5).
--
-- Avant d'ouvrir les inscriptions, il faut savoir qu'une adresse appartient à quelqu'un.
-- Pas pour bloquer l'app : un compte non vérifié s'en sert normalement. Pour fermer les
-- DEUX portes qui sortent de la maisonnée — inviter un co-opérateur et émettre un lien
-- d'invité — parce que ce sont les seules qui envoient quelque chose à un tiers, et
-- qu'une adresse inventée qui peut en inviter d'autres est un relais, pas un compte.
--
-- Même forme que 0133 (password_resets), et pour les mêmes raisons : une LIGNE plutôt
-- qu'un HMAC sans état, parce qu'un usage unique a besoin d'une marque ; le `token_hash`
-- est le SHA-256 du jeton qui voyage dans le courriel, dont le clair n'existe nulle part
-- ailleurs. Sept jours à vivre plutôt que trente minutes : un lien de vérification n'est
-- pas une urgence, et il se renvoie.
--
-- `verified_at` sur operators : NULL = pas encore vérifié.
--
-- LES COMPTES EXISTANTS SONT MARQUÉS VÉRIFIÉS, à leur date de création. Ils se sont
-- inscrits avant que cette porte existe ; leur imposer une vérification rétroactive
-- casserait les liens d'invité déjà envoyés d'une maisonnée qui n'a rien demandé. La
-- vérification garde les comptes À VENIR, ce qui est exactement ce dont l'ouverture des
-- inscriptions a besoin.
ALTER TABLE operators ADD COLUMN verified_at INTEGER;

UPDATE operators SET verified_at = created_at WHERE verified_at IS NULL;

CREATE TABLE email_verifications (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,     -- soft ref: operators.email at request time (no FK)
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_email_verifications_email ON email_verifications (email, created_at);
