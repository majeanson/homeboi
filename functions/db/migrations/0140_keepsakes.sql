-- 0140 — « Souvenirs » : un dessin ou une photo qu'on GARDE (PLAN-mots C1, accepté le
-- 2026-09-25 — « you can put the widget back »).
--
-- Un mot a `saved_at` depuis 0094 (« Gardé » — le destinataire a choisi de le garder ; NULL
-- = pas gardé). Les dessins de la galerie et les photos du cadre n'avaient rien de tel :
-- un mot gardé flottait en haut de « Déjà vus » pour toujours, un dessin ou une photo
-- qu'on voulait revoir n'avait aucune maison. La carte « Souvenirs » du babillard (une
-- étagère qu'on VISITE : pas de compte, pas de « il y a un an ») réunit les trois — donc
-- les trois portent le même mot, `saved_at`, avec le même sens : NULL = pas gardé, sinon
-- la seconde unix où quelqu'un l'a gardé. Le même nom que sur `mots`, pas un `kept` ou
-- un `starred` de plus (conventions de schéma : ne pas frapper un nom neuf pour un sens
-- déjà nommé).
--
-- Additif, forward-only, filename-locked. Rien à remplir : rien n'était gardé avant.
ALTER TABLE drawings ADD COLUMN saved_at INTEGER; -- keepsake; NULL = not kept
ALTER TABLE photos   ADD COLUMN saved_at INTEGER; -- keepsake; NULL = not kept
