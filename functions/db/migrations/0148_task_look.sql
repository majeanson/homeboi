-- 0148 — l'allure d'une tâche : une icône et une couleur (plans/2026-11-06-TACHE-UNIFIEE.md,
-- phase 3). Une tâche hérite de l'allure de son sujet ; ces colonnes sont la REPRISE, quand on
-- veut autre chose. NULL = « comme le sujet », et sans sujet, l'allure par défaut d'une tâche.
-- L'héritage se décide à un seul endroit, côté client (`lookOf`, src/lib/subjects.ts) : le
-- serveur rend la valeur brute.
--
--   icon : un émoji, choisi dans EmojiPicker. Texte libre côté base, borné à l'écriture
--          (`emojiIcon`, _lib/validate.ts).
--
-- `tasks` et `home_projects` ont déjà `colour`, NOT NULL avec '#88a36f' par défaut depuis 0001
-- et 0074 : on ne reconstruit pas deux tables pour la rendre nullable. Cette valeur par défaut
-- est la teinte de la catégorie « tâche » : `lookOf` la lit comme « pas choisie », et un
-- formulaire qui revient à « comme le sujet » l'écrit. `todos` n'avait pas de couleur : elle
-- y naît nullable, dans sa seule orthographe, `colour`.
--
-- Les SUJETS. Un animal gagne `pets.icon` : il n'avait aucune icône. Un carnet n'en gagne PAS :
-- son émoji vit déjà dans `facts_json.emoji`, avec le genre comme repli (`carnetEmoji`), et une
-- deuxième colonne pour le même fait dériverait de la première. Une personne non plus : son
-- allure est son visage (photo ou initiale, `Avatar`) et sa couleur, qui dit aussi « qui ». Un
-- voyage garde sa photo de couverture et son épingle : aucun formulaire n'en règle l'allure, et
-- une colonne que personne ne peut remplir mentirait. Un projet est une ligne de
-- `home_projects` : son icône est celle de la ligne.
--
-- Additif, NULL par défaut : aucune ligne existante ne change d'allure.
ALTER TABLE tasks ADD COLUMN icon TEXT;
ALTER TABLE todos ADD COLUMN icon TEXT;
ALTER TABLE todos ADD COLUMN colour TEXT;
ALTER TABLE home_projects ADD COLUMN icon TEXT;
ALTER TABLE pets ADD COLUMN icon TEXT;
