-- 0147 — deux couches facultatives d'une tâche, côté `home_projects` et `tasks` (plan de la
-- tâche unifiée, phase 2).
--
-- `cleared_at` (tasks, home_projects) : « Effacer les cochées » a retiré cette tâche ponctuelle
-- de la vue du jour plus tôt que la fin de la journée. Pas `deleted_at`, exprès : la ligne
-- reste, parce qu'elle est l'historique du sujet et que le calendrier garde sa case ; seule
-- la coche du jour s'en va. Une nouvelle coche après ça (last_done_at > cleared_at) se relit
-- cochée sans rien remettre à zéro. Les `todos`, eux, n'ont pas besoin de la colonne : leur
-- « Effacer » supprime la ligne, comme il l'a toujours fait.
--
-- `rotation_json`, `current_idx`, `last_done_by` (home_projects) : le chacun-son-tour, offert à
-- n'importe quelle tâche récurrente, et plus seulement aux corvées. Les mêmes trois colonnes
-- que `tasks`, lues par le même code (_lib/rotation.ts) : une rotation, un seul chemin.
-- `last_done_by` est une référence douce vers members.id, sans clé étrangère : retirer une
-- personne ne doit rien entraîner dans son sillage.
ALTER TABLE tasks ADD COLUMN cleared_at INTEGER;
ALTER TABLE home_projects ADD COLUMN cleared_at INTEGER;
ALTER TABLE home_projects ADD COLUMN rotation_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE home_projects ADD COLUMN current_idx INTEGER NOT NULL DEFAULT 0;
ALTER TABLE home_projects ADD COLUMN last_done_by TEXT;
