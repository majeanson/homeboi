-- 0150 — Une seule table de tâches (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4, la fusion).
--
-- LA DÉCISION (le propriétaire, 2026-11-08) : `tasks` (les corvées) et les lignes LIBRES de
-- `todos` emménagent dans une seule table ; les anciens points d'entrée restent comme alias,
-- parce qu'une écriture hors ligne en file d'attente ou un vieil onglet peut encore les appeler.
--
-- L'ÉPINE : `home_projects`, la ligne la plus proche de la forme finale (titre, notes, budget,
-- couleur, date, récurrence, recur_from, report, sujet, rotation, icône, effort). Elle garde son
-- nom : chaque lecteur, chaque sauvegarde et chaque lien `?item=` la connaissent déjà.
--
-- LES IDENTIFIANTS SONT GARDÉS, tous. Une écriture en file d'attente d'hier, un onglet ouvert,
-- un lien `?item=`, le remplacement d'un id `tmp-…` (la guérison des todos) et
-- `task_participants.task_id` continuent de pointer vers la même ligne. Un id déjà présent dans
-- l'épine fait ÉCHOUER la migration (clé primaire) plutôt que d'écraser ou de sauter une
-- ligne : D1 l'applique dans une transaction, donc rien n'est à moitié fait.
--
-- `kind` : 'plan' | 'upkeep' | 'chore' | 'todo'. Ce n'est PAS un type que le formulaire
-- demande (il ne demande jamais rien de tel) : c'est la FACE sous laquelle une ligne paraît
-- dans les charges utiles qui précèdent la fusion. Des lecteurs en ont vraiment besoin :
--   · le tableau envoie encore les corvées (`chores`, `choresToday`, `todos`) à part des
--     lignes de la maison (`homeToday`, `homeOverdue`…), et le modèle du tableau, la vue
--     tout-petit, la page du jour, la recherche et le calendrier les lisent ainsi ;
--   · /api/todos sert encore les tâches libres à côté des listes de départ ;
--   · « Sur quoi ? » n'offre que les PROJETS (kind = 'plan') comme sujet : une corvée ou un
--     à-faire ne doit pas devenir un projet en changeant de table ;
--   · un `at` ne s'écrit pas pareil selon la face (voir plus bas).
-- Une nouvelle tâche prend la face que la règle unique choisit (`taskTarget`), et une
-- modification qui ajoute une couche que sa face ne montre pas la fait monter (todo → chore →
-- maison), jamais descendre. Retirer les faces, c'est réécrire le modèle du tableau sur la
-- forme TaskItem : la prochaine étape, pas celle-ci.
--
-- CORRESPONDANCE, colonne par colonne :
--   tasks (kind = 'chore')                 todos libres (kind = 'todo')
--   title, colour, icon, effort, subject   title, colour (NULL permis), icon, effort, subject
--   recur_start → at (tel quel : NULL      day → at (un minuit LOCAL, comme avant)
--     veut toujours dire « depuis
--     created_at », choreSchedule)
--   recur_json, lead_seconds,              done_at → last_done_at
--     announce_evening                     member_id → member_id (l'AUTEUR, voir plus bas)
--   rotation_json, current_idx,            position → position
--     last_done_at, last_done_by,          updated_at → updated_at
--     cleared_at
--   created_at → created_at ET updated_at  (une corvée n'avait pas d'updated_at)
--   is_sample → is_sample                  is_sample → is_sample
-- recur_from vaut 'anchor', notes, budget, carnet_id et snoozed_until restent NULL : aucune
-- des deux tables ne les avait. Rien d'autre n'existait dans ces tables : rien n'est perdu.
--
-- L'`at` d'une face 'chore' est le début choisi d'une récurrence (NULL = created_at, la règle
-- de 0032) ; celui d'une face 'todo' est un minuit local ; celui d'une ligne de la maison est
-- l'ancre de son formulaire. Trois encodages qui existaient déjà, gardés à l'identique pour
-- que la prochaine date de chaque tâche soit LA MÊME avant et après (worker/taskMerge.d1.test.ts
-- le vérifie). Le formulaire unique envoie les deux (`day` et `at`), et le serveur range celui
-- de la face.
--
-- `member_id` : l'AUTEUR d'un à-faire (le profil qui l'a écrit, X-Profile), qui le teinte quand
-- personne n'est nommé. Ce n'est pas « qui le fait » : ça, c'est `rotation_json`. Une référence
-- douce vers members.id, PAS DE CLÉ ÉTRANGÈRE : retirer une personne détache la ligne
-- (_lib/members.ts), elle ne la bloque ni ne l'efface. `last_done_by` l'était déjà (0147).
-- subject_kind / subject_id restent les références douces de 0146, PAS DE CLÉ ÉTRANGÈRE.
--
-- POURQUOI RECONSTRUIRE l'épine plutôt que d'y ajouter trois colonnes : `colour` y était NOT
-- NULL (0074), et un à-faire sans couleur choisie doit rester NULL (« comme le sujet »). Lire
-- le défaut sauge comme NULL aurait changé ce que l'API rend pour un à-faire dont la sauge
-- était un vrai choix. La couleur garde son défaut : une écriture qui l'omet reçoit la sauge,
-- comme avant. `recur_json` est repris tel quel, NULL = pas de récurrence (0019, 0074) : chaque
-- lecteur le teste ainsi, et conventions.test.ts nomme l'exception.
--
-- `task_participants` (le journal « qui a aidé », 0002) pointait vers tasks(id) par une clé
-- étrangère, et SQLite ne sait pas la changer en place. On le reconstruit SANS clé vers
-- l'épine : `task_id` devient une référence douce, pour trois raisons. 1) La migration ne
-- peut pas échouer sur une vieille ligne orpheline, et elle n'en perd aucune. 2) C'est la
-- règle de la maison pour une attribution en ajout seul : effacer une tâche ne doit rien
-- bloquer. 3) Tous les lecteurs JOIGNENT l'épine avec la garde du ménage, donc une ligne
-- orpheline est invisible, et chaque chemin qui efface une tâche efface son journal d'abord
-- (alias, /api/tasks, balayage du bac à sable, exemples, restauration). `member_id` garde sa
-- clé vers members : rien ne change de ce côté.
--
-- LES ANCIENNES TABLES. `tasks` est SUPPRIMÉE : plus rien ne la référence, et pendant la
-- minute où l'ancien Worker tourne encore sur ce schéma, une écriture de corvée y échoue (500,
-- que la file hors ligne rejoue ensuite sur l'alias) au lieu de réussir dans une table que
-- plus personne ne lit. `todos` RESTE : elle garde les listes de départ (« Avant de partir »,
-- source_template_id ou section), qui ne sont pas des tâches et ne bougent pas. Une ligne
-- libre que l'ancien Worker y écrirait pendant cette minute reste lisible et modifiable
-- (/api/todos lit les deux) ; une migration suivante la rangera dans l'épine.
--
-- Une sauvegarde prise AVANT cette migration (avec `tasks` et des `todos` libres) se restaure
-- encore : `upgradeTakeout` (_lib/restore.ts) fait la même correspondance en TypeScript.

CREATE TABLE home_projects_new (
  id               TEXT PRIMARY KEY,
  household_id     TEXT NOT NULL REFERENCES households(id),
  kind             TEXT NOT NULL DEFAULT 'plan',      -- la face : 'plan' | 'upkeep' | 'chore' | 'todo'
  title            TEXT NOT NULL,
  notes            TEXT,
  budget_cents     INTEGER,
  colour           TEXT DEFAULT '#88a36f',            -- NULL = « comme le sujet » (un à-faire)
  at               INTEGER,                           -- encodé selon la face (voir l'en-tête)
  recur_json       TEXT,                              -- NULL = pas de récurrence (0019, 0074)
  recur_from       TEXT NOT NULL DEFAULT 'anchor',
  lead_seconds     INTEGER,
  announce_evening INTEGER,                           -- 1 ou NULL (0109), « annoncer la veille »
  last_done_at     INTEGER,
  last_done_by     TEXT,                              -- référence douce vers members.id (0147)
  cleared_at       INTEGER,
  snoozed_until    INTEGER,
  rotation_json    TEXT NOT NULL DEFAULT '[]',
  current_idx      INTEGER NOT NULL DEFAULT 0,
  member_id        TEXT,                              -- référence douce : l'AUTEUR d'un à-faire
  position         INTEGER NOT NULL DEFAULT 0,
  carnet_id        TEXT,                              -- référence douce vers carnets.id (0082)
  subject_kind     TEXT,                              -- référence douce (0146)
  subject_id       TEXT,
  icon             TEXT,
  effort           INTEGER,
  is_sample        INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

INSERT INTO home_projects_new
  (id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   member_id, position, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at)
SELECT
   id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   NULL, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   NULL, 0, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at
FROM home_projects;

INSERT INTO home_projects_new
  (id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   member_id, position, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at)
SELECT
   id, household_id, 'chore', title, NULL, NULL, colour, recur_start, recur_json, 'anchor', lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, NULL, rotation_json, current_idx,
   NULL, 0, NULL, subject_kind, subject_id, icon, effort, is_sample, created_at, created_at
FROM tasks;

INSERT INTO home_projects_new
  (id, household_id, kind, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   member_id, position, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at)
SELECT
   id, household_id, 'todo', title, NULL, NULL, colour, day, NULL, 'anchor', NULL,
   NULL, done_at, NULL, NULL, NULL, '[]', 0,
   member_id, position, NULL, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at
FROM todos
WHERE source_template_id IS NULL AND section IS NULL;

CREATE TABLE task_participants_new (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,                        -- référence douce vers home_projects.id (voir l'en-tête)
  member_id      TEXT REFERENCES members(id),
  role           TEXT NOT NULL DEFAULT 'parent',       -- 'parent' | 'child'
  contributed_at INTEGER NOT NULL
);
INSERT INTO task_participants_new (id, task_id, member_id, role, contributed_at)
SELECT id, task_id, member_id, role, contributed_at FROM task_participants;
DROP TABLE task_participants;
ALTER TABLE task_participants_new RENAME TO task_participants;
CREATE INDEX task_participants_task_idx ON task_participants(task_id, contributed_at DESC);

DELETE FROM todos WHERE source_template_id IS NULL AND section IS NULL;
DROP TABLE tasks;

DROP TABLE home_projects;
ALTER TABLE home_projects_new RENAME TO home_projects;
CREATE INDEX home_projects_household_idx ON home_projects(household_id);
