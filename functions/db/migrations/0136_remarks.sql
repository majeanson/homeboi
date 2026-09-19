-- « Les remarques » — ce que la maisonnée remarque de l'app, et la boucle qui se
-- referme dessus (2026-09-18).
--
-- Marc dépose ce sur quoi il bute, depuis l'endroit où il a buté. Claude Code lit la
-- file par le serveur MCP, qui reste en LECTURE SEULE et n'écrit jamais ici. Le
-- PIPELINE DE DÉPLOIEMENT — pas l'agent — marque « expédiée » une fois que le commit
-- qui corrige est vraiment en production. Puis Marc tranche : « c'est réglé », ou
-- « pas réglé » avec sa note. Trois écrivains sur une ligne, et un seul est un humain
-- sur une session.
--
-- TROIS GENRES, UNE SEULE MÉCANIQUE. `kind` = 'bug' | 'wish' | 'polish' (« bogue »,
-- « souhait », « amélioration ») : un sous-type d'entité, ce que CLAUDE.md réserve
-- exactement à ce nom. Un souhait n'est pas un bogue, mais il suit le même chemin —
-- déposé, expédié, confirmé — et rien ne justifierait deux tables pour ça.
--
-- DEUX TABLES, PAS UNE LIGNE AVEC UN journal_json. La forme tentante était une seule
-- ligne portant un tableau JSON {at, kind, text, sha} en ajout-seul. Elle est fausse
-- ICI pour une raison précise : l'écrivain du pipeline n'a ni session, ni acteur, ni
-- clé d'idempotence, et une relance du workflow (ou deux pushes à trois secondes
-- d'écart) fait atterrir deux POST en même temps. Ajouter à une colonne JSON est un
-- READ-MODIFY-WRITE — SELECT le tableau, pousser, UPDATE — et un handler nu n'a pas
-- de transaction autour de ces deux énoncés, donc le second écrivain écrase en
-- silence l'explication du premier. Or l'explication est très exactement la chose que
-- cette fonctionnalité existe pour garder. Un INSERT dans une table enfant est UN
-- énoncé et ne peut pas perdre une écriture. Et « ce commit a-t-il déjà expédié cette
-- remarque ? » — l'idempotence dont le rappel CI a besoin, faute de pouvoir présenter
-- une Idempotency-Key — devient un INDEX UNIQUE au lieu d'un parcours en JS.
-- (json_insert() de SQLite rendrait l'ajout atomique aussi, mais rien dans ce schéma
-- n'utilise encore les fonctions JSON1, et le seul endpoint d'écriture non
-- authentifié de l'app n'est pas l'endroit où découvrir comment D1 les traite.)
--
-- `status` EST UNE PROJECTION EN CACHE du dernier événement, pas un fait indépendant :
-- les événements sont la vérité, `status` est ce sur quoi la file filtre. La règle qui
-- empêche les deux de diverger : TOUT écrivain qui fait avancer `status` porte
-- `AND status <> 'confirmed'` dans son WHERE, pour que le pipeline ne puisse jamais
-- ramener dans la file une remarque que Marc a déjà bénie.
--
-- `deleted_at` (suppression douce), ET NON le motif suppression-dure + undo
-- compensatoire des todos. Ce précédent vaut pour une ligne que SEULE l'app peut
-- adresser. Une remarque est adressable PAR ID DEPUIS L'EXTÉRIEUR, pendant très
-- exactement la fenêtre où le toast d'annulation est ouvert : un déploiement qui
-- atterrit là tomberait sur une ligne effacée, et l'undo compensatoire devrait
-- ré-INSÉRER le parent ET ses enfants en courant contre ce même pipeline. En douce,
-- « Annuler » est un seul UPDATE, l'endpoint a une règle nette — supprimé se lit comme
-- inconnu, un déploiement ne ressuscite rien — et le journal garde sa trace.
--
-- Le TRIO MÉDIA va sur les ÉVÉNEMENTS, pas sur la remarque : chaque entrée du journal
-- porte sa propre pièce jointe, donc le signalement initial a sa capture d'écran ET la
-- note « pas réglé » peut en avoir une nouvelle. Invariant maison : media_key est mis
-- ssi media_kind est mis (functions/_lib/invariants.ts le vérifie désormais pour vrai,
-- et a trouvé cette table tout seul — il découvre le schéma au lieu de le réciter).
--
-- Balayé par le bac à sable : `remarks` dans HOUSEHOLD_TABLES, `remark_events` dans
-- CHILD_TABLES (functions/_lib/demoHousehold.ts), plus remark_events dans son
-- inventaire média sans quoi la sweep laisse des blobs R2 orphelins. Et
-- `remark_events` rejoint VIA_PARENT de takeout.ts, sans quoi le journal est absent de
-- chaque export ET de la sauvegarde nocturne.
CREATE TABLE remarks (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  -- Sous-type : 'bug' | 'wish' | 'polish'. TEXT libre plutôt qu'un CHECK, comme tout
  -- discriminateur ici — le handler valide, et un quatrième genre ne doit pas demander
  -- une migration.
  kind          TEXT NOT NULL DEFAULT 'bug',
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  -- La clé du registre d'aide de la section où c'est arrivé (« kitchen.recipes »).
  -- Réf MOLLE vers un registre en code, pas vers une ligne : un contexte SÉMANTIQUE,
  -- qui vaut mieux qu'un chemin d'URL pour retrouver le code responsable.
  help_key      TEXT,
  -- La route où c'était. `seen_path` et non `seen_on` : partout ailleurs ici, `*_on`
  -- se lit comme une date.
  seen_path     TEXT,
  -- Le commit que le rapporteur faisait tourner (__BUILD_SHA__). C'est ce qui permet
  -- de lire LE code de ce moment-là au lieu de deviner depuis un horodatage.
  seen_build    TEXT,
  -- Ce que l'app savait sans qu'on lui demande : thème, lentille, surface, taille de
  -- fenêtre, en-ligne, dernières erreurs console. Objet JSON, jamais NULL.
  context_json  TEXT NOT NULL DEFAULT '{}',
  -- État de workflow : 'open' | 'shipped' | 'confirmed'. Voir la note sur la projection.
  status        TEXT NOT NULL DEFAULT 'open',
  -- réf molle : members.id de QUI a déposé (auteur, pas sujet). Pas de FK — un membre
  -- peut partir, ses remarques restent.
  reported_by   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
-- La seule lecture qui compte : la file ouverte de cette maisonnée, la plus vieille
-- d'abord — ce que l'outil MCP et la liste de Réglages parcourent tous les deux.
CREATE INDEX idx_remarks_household_status ON remarks (household_id, status, created_at);

CREATE TABLE remark_events (
  id                TEXT PRIMARY KEY,
  -- Réf DURE : une entrée de journal sans sa remarque n'est rien. ON DELETE CASCADE
  -- pour qu'une vraie suppression (la sweep, une restauration) ne puisse pas orpheliner
  -- le journal.
  remark_id         TEXT NOT NULL REFERENCES remarks(id) ON DELETE CASCADE,
  -- 'filed' | 'shipped' | 'confirmed' | 'reopened'.
  kind              TEXT NOT NULL,
  -- Les mots : la note de Marc sur « pas réglé », le paragraphe « Explication: » du
  -- commit sur une expédition. Coupé par l'écrivain, délibérément pas par le schéma.
  text              TEXT NOT NULL DEFAULT '',
  -- Le commit qui portait le correctif, sur un événement 'shipped' ; NULL partout
  -- ailleurs. Hex minuscule 7–64, validé par l'endpoint AVANT stockage — sans quoi le
  -- lien construit à partir de ça pourrait devenir autre chose qu'un lien. Réf molle
  -- vers un objet git : git n'est pas une table, il n'y a rien à référencer.
  sha               TEXT,
  -- Le trio média, PAR ENTRÉE (voir l'en-tête). media_key mis ssi media_kind mis ;
  -- scene_key seulement sur un dessin ré-éditable.
  media_kind        TEXT,
  media_key         TEXT,
  scene_key         TEXT,
  -- réf molle : members.id pour un événement HUMAIN ('filed'/'confirmed'/'reopened') ;
  -- TOUJOURS NULL sur 'shipped', qu'aucun membre n'a posé — le pipeline l'a posé. Un
  -- événement machine ne doit jamais pouvoir porter un visage.
  author_member_id  TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_remark_events_remark ON remark_events (remark_id, created_at);
-- L'IDEMPOTENCE du rappel de déploiement, comme contrainte plutôt que comme parcours :
-- un commit expédie une remarque une fois. Une relance du workflow, ou un retry dans le
-- script de notification, bute ici et n'écrit rien (INSERT OR IGNORE → changes = 0 →
-- l'endpoint répond 200 duplicate). PARTIEL, parce que tout événement non-'shipped' a
-- un sha NULL et que plusieurs de ceux-là sur une remarque sont parfaitement légitimes.
CREATE UNIQUE INDEX idx_remark_events_ship_once ON remark_events (remark_id, sha) WHERE sha IS NOT NULL;
