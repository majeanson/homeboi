-- 0146 — « Sur quoi ? » : une tâche a un sujet, ou aucun (plans/2026-11-06-TACHE-UNIFIEE.md,
-- phase 2). Une référence douce, à deux colonnes, sur les trois tables de tâches :
--
--   subject_kind : 'carnet' | 'person' | 'pet' | 'project' | 'trip'. NULL = aucun sujet.
--   subject_id   : l'identifiant de la chose nommée. NULL si et seulement si subject_kind l'est.
--
-- PAS DE CLÉ ÉTRANGÈRE, exprès : la référence pointe vers cinq tables selon `subject_kind`,
-- et supprimer un carnet, une personne ou un voyage ne doit jamais effacer ni bloquer une
-- tâche. Une référence orpheline se lit « sans sujet » ; elle n'est jamais réécrite. Une
-- tâche a exactement un sujet, ou aucun, et « Qui ? » reste un axe à part.
--
-- `home_projects.carnet_id` RESTE et demeure l'endroit où ces lignes gardent leur carnet : il
-- se lit comme subject_kind = 'carnet' (`subjectFromRow`, _lib/subject.ts). Les migrations
-- ne sont jamais réécrites, et deux colonnes pour le même fait dériveraient l'une de l'autre.
-- Un sujet d'un autre genre remet carnet_id à NULL, et inversement : un seul sujet.
--
-- Additif, avec NULL par défaut : aucune ligne existante ne change de sens. Pas d'index :
-- ces tables comptent une poignée de lignes par maisonnée, et /api/tasks les lit toutes.
ALTER TABLE tasks ADD COLUMN subject_kind TEXT;
ALTER TABLE tasks ADD COLUMN subject_id TEXT;
ALTER TABLE todos ADD COLUMN subject_kind TEXT;
ALTER TABLE todos ADD COLUMN subject_id TEXT;
ALTER TABLE home_projects ADD COLUMN subject_kind TEXT;
ALTER TABLE home_projects ADD COLUMN subject_id TEXT;
