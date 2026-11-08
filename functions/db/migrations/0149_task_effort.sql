-- 0149 — l'effort d'une tâche (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3b, « Trouver quoi
-- faire »). Cinq points : 1 = tout simple, 5 = gros effort. NULL = pas dit, et c'est l'état
-- normal : le champ est optionnel, et le chercheur montre une tâche sans effort sous CHAQUE
-- effort, pour que sauter le champ ne cache jamais rien.
--
-- Jamais des minutes : c'est une impression, pas une durée, et une durée deviendrait un compte.
-- L'effort note une TÂCHE, jamais une personne : aucune colonne ici ne dit qui a fait quoi en
-- combien (NFR-CALM-1).
--
-- Borné à l'écriture, à un seul endroit (`taskEffort`, _lib/validate.ts) : un entier de 1 à 5,
-- tout le reste s'écrit NULL. Pas de CHECK : SQLite ne sait pas en ajouter un par ALTER, et la
-- borne vit déjà avec les autres.
--
-- Additif, NULL par défaut : aucune ligne existante ne change.
ALTER TABLE tasks ADD COLUMN effort INTEGER;
ALTER TABLE todos ADD COLUMN effort INTEGER;
ALTER TABLE home_projects ADD COLUMN effort INTEGER;
