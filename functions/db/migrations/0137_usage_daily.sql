-- 0137 — « Ce que ça coûte », par maisonnée et par jour (STATE.md §4-K Wave 5).
--
-- Deux ressources de l'app se PAIENT à l'usage et rien ne les bornait : les appels à
-- Workers AI et les octets téléversés dans R2. Le bac à sable de démo est une vraie
-- session d'opérateur — le frapper coûte un seul POST non authentifié — donc un visiteur
-- pouvait appeler /api/transcribe (16 Mo d'audio par appel, whisper-large-v3-turbo) ou
-- /api/ask (un modèle 70B) autant de fois qu'il voulait. La frappe est bornée ; ce qui
-- suit la frappe ne l'était pas.
--
-- L'ASYMÉTRIE QUI REND ÇA URGENT : le R2 est LOUÉ — la balayeuse de 24 h récupère les
-- blobs d'un bac à sable — tandis que les neurones sont BRÛLÉS. Rien ne les rend.
--
-- Pourquoi une table plutôt que les bindings de limitation : ceux-ci sont des fenêtres
-- courtes et fixes, par colo, et leur propre commentaire le dit — « une borne, pas un
-- système de comptabilité ». Un budget quotidien a besoin d'un compteur qui se souvient.
--
-- `day` est un localDayStart() dans le fuseau de LA MAISONNÉE (0135) : un compteur
-- quotidien qui tournerait à minuit UTC couperait le souper d'une famille de Vancouver.
-- Pas de colonne `id` : la paire (maisonnée, jour) EST la ligne, et une clé primaire
-- composite dit exactement ça.
CREATE TABLE IF NOT EXISTS usage_daily (
  household_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  upload_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, day)
);
