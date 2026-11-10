-- 0153 — `kind` ne dit plus que ce qu'une tâche EST : 'plan', 'upkeep', ou rien
-- (plans/2026-11-06-TACHE-UNIFIEE.md, « Still to do » (3), décisions du propriétaire du 2026-11-10).
--
-- LES TROIS DÉCISIONS qui rendent ce pas possible, chacune tenue ailleurs, en code :
--   1. le coche : toute tâche cochée note qui l'a fait (le profil qui agit, sinon le tour) dans
--      `task_participants`, et le tour ne passe que si « chacun son tour » est mis
--      (_lib/taskGestures.ts) ;
--   2. « Vider les cochés » garde chaque tâche comme historique (`cleared_at`) et n'efface plus
--      rien ; les listes de départ (`todos`) gardent leur propre « Vider » ;
--   3. le jour d'une tâche est un minuit LOCAL du ménage, écrit et lu par un seul encodeur
--      (_lib/taskDay.ts).
-- Après eux, rien de ce qu'une ligne 'chore' fait ne diffère de ce qu'une ligne 'todo' fait :
-- les deux deviennent NULL, une simple tâche, et les trois alias (/api/chores, /api/todos,
-- /api/home-projects) ne sont plus qu'un seul chemin.
--
-- POURQUOI RECONSTRUIRE. `kind` était NOT NULL DEFAULT 'plan' (0150), et SQLite ne sait pas
-- changer cela en place. La reconstruction est celle de 0150, colonne pour colonne, identifiants
-- gardés, avec deux différences :
--   · `kind TEXT` nullable, SANS défaut : une écriture qui l'omet est une simple tâche, jamais
--     un projet par accident (le défaut 'plan' de 0074 en faisait un) ;
--   · un CHECK : `kind` vaut NULL, 'plan' ou 'upkeep', rien d'autre. Une face ne peut pas
--     revenir par une porte oubliée. Pendant la minute où l'ancien Worker tourne encore sur ce
--     schéma, une écriture de corvée ou d'à-faire y échoue (500, que la file hors ligne rejoue
--     ensuite sur le nouvel alias) au lieu d'écrire une face que plus personne ne lit : le même
--     choix que 0150 pour `tasks`.
--
-- `at` N'EST PAS TOUCHÉ ICI. Le réécrire en minuit local demande le décalage du fuseau du
-- ménage À CET INSTANT (0135 : n'importe quel nom IANA, avec ses propres règles d'heure
-- avancée), et D1 n'a aucune base de fuseaux. Une réécriture juste pour Toronto et fausse pour
-- la maisonnée suivante serait une migration à moitié juste. Le Worker la fait
-- (`normalizeTaskDays`, _lib/taskDay.ts, chaque nuit, ménage par ménage dans son fuseau,
-- idempotente), et chaque lecteur décode `at` en attendant (`taskDay`), exact pour les trois
-- encodages : ce qu'un ménage voit ne dépend pas de l'heure où la réécriture passe.
--
-- `member_id` reste l'AUTEUR (le profil qui a écrit la tâche), une référence douce vers
-- members.id, PAS DE CLÉ ÉTRANGÈRE (0150). subject_kind / subject_id restent les références
-- douces de 0146, PAS DE CLÉ ÉTRANGÈRE. `last_done_by` et `carnet_id` aussi.
--
-- Rien ne référence `home_projects` par une clé étrangère (task_participants.task_id est une
-- référence douce depuis 0150) : la reconstruction ne touche aucune autre table. Exercice :
-- worker/taskKindShrink.d1.test.ts (une 2e base à 0152, toutes les variétés, trois fuseaux,
-- l'identité et le jour AFFICHÉ de chaque tâche avant et après).

CREATE TABLE home_projects_new (
  id               TEXT PRIMARY KEY,
  household_id     TEXT NOT NULL REFERENCES households(id),
  kind             TEXT CHECK (kind IS NULL OR kind IN ('plan', 'upkeep')), -- NULL = une simple tâche
  title            TEXT NOT NULL,
  notes            TEXT,
  budget_cents     INTEGER,
  colour           TEXT DEFAULT '#88a36f',            -- NULL = « comme le sujet »
  at               INTEGER,                           -- le jour : un minuit LOCAL (_lib/taskDay.ts)
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
  member_id        TEXT,                              -- référence douce : l'AUTEUR d'une tâche
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
   id, household_id, CASE WHEN kind IN ('plan', 'upkeep') THEN kind ELSE NULL END, title, notes, budget_cents, colour, at, recur_json, recur_from, lead_seconds,
   announce_evening, last_done_at, last_done_by, cleared_at, snoozed_until, rotation_json, current_idx,
   member_id, position, carnet_id, subject_kind, subject_id, icon, effort, is_sample, created_at, updated_at
FROM home_projects;

DROP TABLE home_projects;
ALTER TABLE home_projects_new RENAME TO home_projects;
CREATE INDEX home_projects_household_idx ON home_projects(household_id);
