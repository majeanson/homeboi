-- 0145 — le troisième compteur du budget quotidien (0137) : les rendus Browser Run.
--
-- L'import d'une recette par lien essaie, quand un site refuse le Worker (Akamai :
-- recettes.qc.ca, Zeste, IGA), de rendre la page dans un vrai navigateur côté Cloudflare
-- (_lib/renderPage.ts). Le palier gratuit, c'est 10 minutes de navigateur PAR JOUR pour
-- tout le compte : sans plafond, une seule maisonnée (ou un bac à sable) le viderait
-- pour toutes les autres. Même ligne, même jour local, même confiance que ai_calls et
-- upload_bytes — un compteur de plus, pas une table de plus.
ALTER TABLE usage_daily ADD COLUMN browser_renders INTEGER NOT NULL DEFAULT 0;
