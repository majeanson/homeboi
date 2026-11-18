# STATE.md — where Babillard is, what's left, and how we've been working

> **What this file is.** The single front door. Nine other root markdown files hold real,
> careful detail; none of them answers "what should I do next?", which is why that
> question has to be asked out loud every session. This file answers it, and points at
> the detail rather than repeating it.
>
> **It is kept SHORT on purpose** (2026-09-17). It had grown to 4 289 lines, of which the
> only open work started at line 3 490 — so the question it exists to answer was behind
> 81 % of the file. What shipped, and every closed finding, went to git — where the
> `bmad/` planning folder followed it on the same day. A line budget is enforced by
> `src/lib/docCounts.test.ts`, and it is a ratchet: it may fall, never rise.
>
> **Written 2026-08-27**, after a four-wave sweep (commits `8e526e3`, `e76bfe1`,
> `375856c`, `31598dd`). Everything below was verified against code or a command run
> that day — **not** read off another document. That distinction is the whole point:
> see [§5](#5-process-review--fresh-eyes).
>
> **Keep it living.** When a wave lands, update §1's numbers and §4's ranking here, in
> the same commit. If this file goes stale it becomes the fourteenth problem. And when
> the NEXT session's first §3 entry lands, CUT the current ones — git keeps them, and
> that is what keeps this file short.

---

## 1. Snapshot

| | |
| --- | --- |
| **What it is** | A calm household command-center for a cheap always-on wall tablet. Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 + Workers AI + R2. FR-CA first. |
| **Code** | ~157k lines across 955 `.ts`/`.tsx` files (`src/`, `functions/`, `worker/`) |
| **Schema** | 153 forward-only migrations (0150 = une seule table de tâches, 0152 = le début de chaque série écrit, 0153 = `kind` ramené à `plan · upkeep · NULL`) |
| **Tests** | 3 038 unit tests in 264 files (2026-11-05, night) · 156 real-runtime cases in 24 files (`npm run test:d1`, the Worker in workerd against a real D1) · 195 Playwright spec files |
| **Deploy** | Push to `main` → CI (typecheck · test · build · bundle budget · **test:d1** · knip) gates `db:migrate:prod` + `wrangler deploy`. E2E is decoupled (`workflow_run`), runs after a green CI, never blocks the ship. |
| **Second interface** | `/api/mcp` — read-only over the household — of the 12 tools, most proxy a GET handler that already exists, so the caps, the recurrence expansion and the time zone are decided once and inherited. (This row lives HERE, not in §3: docCounts derives that number from the registry, and the claim died the first time §3 rotated.) |
| **Households in production** | **Six** real, re-counted in D1 on 2026-09-29 — Marc's (4 members), four other real accounts from the invite gate, and the legacy read-only demo singleton — plus two live 24 h sandboxes. **Zero signups in the five days since the gate opened (09-24)**: the door works (the weekly stranger walk is green), nobody has come through it yet — and whether nobody CAME is now answerable: the nightly mail counts trials opened, kept and refused at the cap, and direct signups (0141, `_lib/strangers.ts`) |

*(Numbers rot: re-run the commands before quoting them — `docCounts.test.ts` holds the derivable ones.)*

### Health signals

- `npm run typecheck` · `npm run lint` (oxlint, since 2026-11-05) · `npm test` · `npm run test:d1` · `npm run build` · `npm run check:bundle` · `npm run knip` — green 2026-11-05, and all seven gate the deploy.
- `npm run e2e:ci` — CI's E2E job is the standing whole-suite signal, and it chains off
  CI, so **a red CI means no E2E ran at all** (that hid three commits' worth of failures
  for a day). One process OOMs on Marc's machine (2026-09-22); `npm run e2e:local` does not — 8
  shards in turn, a Vite each, CI's strictness: 2 199 passed, 55 min, ≥ 5.3 GB free (2026-11-16).
- `npm run e2e:sw` — 5 passed (the kiosk's offline reboot, against the real PROD bundle).
- `npm run check:bundle` — the door's static closure is **9 chunks / 522 KB** (was 70 /
  1 131 before the hub went lazy); every chunk within budget; the SW precache covers all
  offline-needed chunks and skips build metadata.
- **The build-gating invariants** are the codebase's best feature (§5), and the list is
  long enough that it belongs where it is enforced rather than here: every one lives in
  `src/lib/*.test.ts`, `functions/_lib/*.test.ts`, `scripts/*.test.mjs` or
  `scripts/check-bundle.mjs`, each with a header saying what it caught. Three joined on 2026-09-19: `csrfExempt`
  (a ratchet on the CSRF-exempt set — it found `pair/poll` sitting there answering GET
  only), `ci-untrusted` (no `${{ github.event… }}` may reach a `run:` block — it found an
  existing one in `sw-repro.yml`), and `deployHook` (the polarity of the only inbound
  shared-secret gate). The rule that matters is §5's: **a guard that has never been red
  proves nothing** — plant the defect, watch it fail, restore.
- **`data_invariants` is a new TIER of guard**, not another entry on that list: every
  test above reads source, and this one reads ROWS (`functions/_lib/invariants.ts`, via
  the MCP tool or `worker/invariants.d1.test.ts`). It is read-only and per-household, and
  it distinguishes « not checked » from « fine » on purpose.

## 2. The document map

**Nine** root `.md` files beside this one and `README.md`. They are **not**
interchangeable. Read this table before opening any of them.

> **The checkbox convention** (repo-wide, adopted 2026-08-28 — this is the canonical
> statement; the ledgers carry a copy):
>
> | | |
> | --- | --- |
> | `- [ ]` | **open work.** Someone still has to do it. Nothing else uses this. |
> | `- [x]` | done — with the file:line or commit that settles it |
> | `- [~]` | reviewed and parked, **with the why** — so it isn't re-litigated |
> | `❓` | an open **question**, not a task |
> | ⚪ | an **idea pool** entry — uncommitted, never a queue |
>
> Templates (`PARITY.md` Parts 5–6, `ACTIONS.md` Part 5) and idea pools carry **no
> checkboxes at all**. Before this, `- [ ]` meant three different things and any count
> of "open items" read **75** when the true number was 17 — a mis-count that opened at
> least one session on the wrong work. `grep -rc -- "- [ ] " *.md` is now
> a number you can trust. It reads **27** — all of them `REVIEW-TRACKER.md`'s (the 7-persona
> review of 2026-11-17; 0 before it). **Asserted from the boxes themselves** by
> `src/lib/docCounts.test.ts`, so this sentence cannot drift the way `REVIEW-PASS.md`'s
> banner once did — it claimed 15 for twelve days against a single box.
>
> **A written box is the RARE case, not the backlog.** Most of what is worth doing lives
> in judgement: the idea pools, the parity matrix's own cells, a device pass, the next
> sweep of screenshots. Read §4 before picking work.
>
> **What `[~]` may NOT be used for:** a bullet that still says "Still open: …" is open
> work, not a park. Four were flipped back from `[~]` to `[ ]` on the day the convention
> shipped, for exactly that reason.

| File | Kind | Status |
| --- | --- | --- |
| **STATE.md** | ← you are here | The front door. Start here. §4 is what is open. |
| `CLAUDE.md` | **Law** | Build-by-reuse rules, conventions, the primitive table. Read before writing code. |
| `PARITY.md` | **Playbook** | The feature × dimension matrix + the canonical new-entity checklist. 0 open — Wave D is a `[~]` standing policy. Parts 5–6 are a template: copy, don't tick. |
| `ACTIONS.md` | **Playbook** | The action × door matrix (action × entry point × undo tier × non-touch). No open items — Part 5 is a template. |
| `LEAN.md` · `DISCOVERY.md` · `COMPONENTS.md` · `OFFLINE.md` · `DEPLOY.md` | Reference | Consult when touching their concern. |
| `PLAN-mots-and-lifecycle-followups.md` | ⚪ Idea pool | 12 designed features, walked with Marc 2026-09-25: 7 accepted and shipped, 4 dismissed. Closed. |
| ~~`bmad/`~~ | **Deleted 2026-09-17** | The planning folder and the archive: brief, PRD, architecture, the idea pools, every finished ledger, and this file's own past. ~10 000 lines of documents about an app that is built. **In git, not in the tree** — `git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it. Code comments still cite its tags (`NFR-CALM-1`, `PRD C5`, `bmad/08 E-36`); they are labels now, not pointers (see CLAUDE.md ▸ Requirement tags). |

**The trap this table used to exist to stop is now fixed at the source.** `PARITY.md` +
`ACTIONS.md` contributed 40 unticked boxes that were templates; they are plain bullets
now, so the repo-wide count is honest for the first time.

---

## 3. What just shipped

### La cuisine : des repas liés dans « À placer », et déposer dans UN repas d’un jour — 2026-11-16
Marc : « link two recipes together in the À placer panel so that after they move together until explicitly unlinked … be able to drop inside specific meals for a date … dinner being the most spacious and obvious drop zone ». (1) **Liens** : `meals_unplaced.link_id` (0156) — un groupe n’est que les lignes qui partagent la clé, NULL = seule. **Lier = glisser une ligne sur une autre** (chaque ligne est une zone `unplacedrow:<id>` ; 2026-11-17 : pas de bouton toujours visible), ou toucher une ligne → puces « Lier à ». **Détacher** = la chaîne brisée sur la ligne même, à côté du ✕. Une seule écriture `POST /api/meals { action: 'link', groups }` (chaque liste = un groupe, une liste d’un = seule). Un groupe glisse, se place (toucher → choix du jour) et atterrit d’un bloc, dans un seul créneau. Un souper de plusieurs repas glissé d’un jour vers la carte y arrive LIÉ (`unplace` + `linkId`, frappé côté client par `newLinkId`). (2) **Déposer dans un repas** : quand un glisser arrive sur un jour, ce jour seul ouvre ses pastilles de repas PAR-DESSUS la carte (zones `slot:<date>:<slot>` imbriquées dans celle du jour — jamais de redimensionnement sous le doigt ; sur une carte courte le panneau garde un plancher et déborde sur le jour suivant). La grande bande du haut est le créneau DU REPAS GLISSÉ (2026-11-17) : un déjeuner lâché « sur le jour » reste un déjeuner ; les autres créneaux visibles, une rangée dessous (`grid-side-meal-drag.spec.ts`). « Quel repas ? » dans le panneau d’une ligne CHANGE la ligne (2026-11-17, `{ action: 'slot', ids, slot }`, tout le groupe) : son icône, son créneau d’arrivée et la grande bande. Gardes : `worker/meals.d1.test.ts` (lier, couper, isolation, clé malformée), `e2e/unplaced-meals.spec.ts` (lier en glissant, détacher, « Lier à », groupe glissé, pastille de créneau).

### L’IA épuisée se dit calmement ; la photo se lit quand même — 2026-11-16

`app_health` montrait le quota gratuit Workers AI du COMPTE (10 000 neurones/jour, partagé par chaque maisonnée et CHAQUE modèle — aucun modèle plus petit ne peut prendre le relais) épuisé deux fois par des lectures de recettes. Marc : « handle it well », et pour la photo « a lower free model as a last case scenario, visually explicit ». (1) Le toast IA de toutes les autres portes (capture, suggestions, Demande…) affichait le texte brut de Cloudflare (« 4006: you have used up… ») : il dit maintenant « L’IA se repose » et l’heure du retour (quota du compte) ou minuit (budget de la maisonnée), un seul avis par épuisement au lieu d’un par fonction ; « Accepter » journalise toujours le texte brut. Le motif est UN (`src/lib/aiQuota.ts`), partagé par `_lib/ai.ts`. (2) Photo → recette : le seul lecteur gratuit sans IA est Tesseract sur le téléphone ; sa lecture peu sûre (< 40 %) était JETÉE et le cuisinier lisait « colle le texte ». En dernier recours (aucun lecteur IA n’a répondu), elle est gardée, marquée `weakRead`, et le panneau de vérification le dit EN PREMIER, ton erreur (`deviceReadVerdict`, `lib/ocrPref`). Au passage : un lecteur vision qui ne répondait RIEN prêtait ses 95 % à la lecture du téléphone déjà présente — une lecture branlante passait pour sûre, sans avertissement. Garde : `aiQuota.test.ts`, `ocrPref.test.ts`, `e2e/ask-sheet.spec.ts`, `e2e/recipe-read-review.spec.ts` (spécimen DevKit « Lecture de secours ») — rouges sur l’ancien code. Puis (même jour) le toast IA, qui restait sous le fond du dialogue qui l’avait levé (la Demande) : il passe au-dessus de tout dialogue (`--z-toast-ai` 165) et se rend dans `<body>` comme Modal/Sheet — le chiffre seul ne suffisait pas, le toast vivait dans un autre contexte d’empilement. Le toast d’annulation reste bas, exprès. Garde : `layer-order.test.ts` (rouge sur 42), `e2e/ask-sheet.spec.ts` « Accepter » dialogue ouvert (rouge sans le portail). Puis les quatre gardes de la vague 6.6/6.7 qui manquaient, chacune plantée rouge : `fetch-rule` (un `fetch(` hors `api.ts` : `imgUrl` par forme, sinon une raison), `querykey-rule` (une clé littérale au point d’appel — trois des huit étaient déjà des doubles : `['health']`, `['flyers', jour]`, `['chores-ledger']` ; `CHORES_LEDGER_KEY` rejoint `queryKeys.ts`), `surface-rule` (une lecture de largeur demande une raison ; elle a trouvé `motion.ts` que le plan ne listait pas), `detail-rule` (chaque `DetailKind` est construit, chaque constructeur est appelé — PARITY D2 n’est plus manuel).

### La cuisine : « À placer », la semaine avant ses jours — 2026-11-14
Marc : « an empty planning day as a first pill … plan the week without assigning a day yet, say have 5 meals in there, and drag and drop easily ». La grille Repas ouvre maintenant sur une carte **« À placer »** (`UnplacedDay`), avant aujourd’hui : les repas de la semaine sans jour. Table `meals_unplaced` (0155) — pas une `meals.date` nullable (chaque lecteur de repas est un balayage de dates, un repas sans date y aurait fui en 1970), pas `meal_ideas` (une idée est réutilisable ; un repas à placer est CONSOMMÉ en se posant). Elle voyage dans la lecture `GET /api/meals` (`unplaced`), une seule clé de cache ; trois actions sur `POST /api/meals` — `park`, `unplace`, `place` — gardent **le même id** d’une table à l’autre (le déplacement optimiste est une ligne qui change de liste ; un rejeu ne trouve plus rien à bouger), et `DELETE { unplaced: true }` vide la carte. Portes : son ＋ (recettes), la puce « À placer » en tête du choix de jour d’une idée (`MealPlanPicker.onPickUnplaced`), glisser un repas d’un jour vers la carte (`dayDnd`, le créneau suit : un dîner reste un dîner), glisser une ligne vers un jour, ou la toucher pour choisir un jour (le miroir souris/clavier). Même jour, audit des filtres du livre de recettes, trois bogues : « Oubliées » ne voyait que 3 jours (`recent` de /api/meals) — tout le reste lisait « jamais encore » ; lu maintenant sur tout l’historique (`/api/meal-history?lastServed=1`). Un filtre dont la puce a disparu (dernier ❤ retiré avec « Favoris » actif, étiquette renommée) filtrait encore et comptait dans « Filtrer » : seul ce qui se VOIT compte. Renommer/retirer une étiquette suit maintenant dans les règles des pastilles perso (un retrait n’élargit jamais une pastille). Puis (Marc : « plan for this "day" too … from recipes and such ») **chaque** `MealPlanPicker` mène par « À placer » : « Planifier » d’une recette, toutes les sources d’Idées, Historique, et « Déplacer… » de la journée (= `unplace`, avec « Annuler »). `useCreateWithUndo` gagne `undoBody`. Les specs e2e qui prenaient `.kitchen__day` `.first()` pour « aujourd’hui » visent `.is-today`. Garde : `worker/meals.d1.test.ts` (même id, créneau gardé, rejeu, isolation entre maisonnées), `e2e/unplaced-meals.spec.ts`. **Audit « Restants » (2026-11-15)** : deux vrais bogues. (1) « Créer des restants » depuis le coup d’œil d’un repas du babillard (4 portes) n’envoyait que `{ id, title }` — le restant perdait la recette que le coup d’œil venait de résoudre (pas de 📖, titre nu une fois planifié) ; il passe maintenant par `leftoverFrom` (même résolution que `useOpenMeal`). (2) `usePlanLeftover` / `useAnnounceLeftover` offraient « Annuler » même quand le serveur avait REFUSÉ l’écriture : l’annulation d’un plan refusé re-postait le restant (doublon dans Restants), et son toast recouvrait « Pas enregistré » en disant « planifié ». Garde : `e2e/recipe-leftovers.spec.ts` (les deux échouent sur l’ancien code). Puis les trois restes de l’audit, corrigés le même jour : un plan fait HORS LIGNE n’avait pas d’id de repas, donc son « Annuler » remettait le restant sans retirer le repas — le client frappe maintenant l’id (`mealId`, la forme de `newId()`, tout le reste est ignoré) et l’annulation en file le supprime après le plan ; `action: 'plan'` lisait puis supprimait en trois requêtes (deux appareils au même instant → deux repas) — c’est un seul `batch` (INSERT…SELECT…RETURNING + DELETE), le second ne trouve plus rien ; et `GET /api/meals` comptait en 24 h : les puces « déjà mangé » perdaient le plus vieux jour à l’automne (73 h), la fenêtre roulante débordait d’un jour au printemps (23 h) — `addLocalDays` aux deux bornes. Garde : `worker/meals.d1.test.ts` (course, id frappé, les deux saisons), `e2e/recipe-leftovers.spec.ts` (« Annuler » hors ligne) — tous rouges sur l’ancien code.

### Voyage partagé : le lien se regarde sans compte ; « Qui apporte quoi » et « Qui cuisine » — 2026-11-12
Pour un camping entre amis en 2027 (Marc). **L’aperçu public** : `GET /api/shared-trip-join?j=` n’est plus `authed()` — le jeton est la capacité, comme `/api/share-public` — et rend le voyage ENTIER en lecture seule (itinéraire, infos, valises, documents, matériel, repas), les maisonnées sous des alias (`h0`, `h1`…, `previewAliases`) : aucun id de ménage ne sort (test D1 planté rouge en fuyant `author_household_id`). La page `/voyage/rejoindre` rend le MÊME corps que la scène (`SharedTripTabs`, extrait de `SharedVoyagePage`) dans un `VoyageApi` `readOnly` qui cache chaque porte ; sans session : « Créer mon compte et rejoindre » / « J’ai déjà un compte », tous deux avec `?next=` vers le lien — **`/signup` honore maintenant `?next=`** (même garde que `/login`). Un invité ou une tablette voit l’aperçu et une ligne « ouvre-le sur ton téléphone ». **Le lien dure jusqu’à la fin du voyage** (`sharedTripInviteTtl` : fin + 2 j, min 14 j, max 400 j ; la rotation du nonce reste le vrai bouton d’arrêt). **`shared_trip_claims` (0154)** : une rangée du voyage qu’UNE maisonnée prend — `kind` `gear` (Bagages, en tête : « Je l’apporte ») ou `meal` (nouvel onglet « Repas » : déjeuner/dîner/souper par jour, « On cuisine » + menu). N’importe quel membre ajoute ou renomme ; seule la maisonnée qui l’a prise la laisse ; une rangée prise n’est pas supprimable par une autre ; un repas par (jour, moment), 409 sinon ; quitter le voyage relâche ses prises ; dissoudre les efface. Inscrite au balayage démo, au restore, au takeout, au `Wire`, à realtime. Calme : un nom sur une rangée, jamais un compte.

### Une seule notion de tâche : un seul geste, un seul jour, plus de faces — 2026-11-10
Décisions du propriétaire (2026-11-10), le « Still to do (3) » du plan. **Le coche** : toute tâche cochée note qui l’a fait dans « qui a aidé » (le profil qui agit, sinon le tour), et le tour ne passe que si « chacun son tour » est mis. **« Vider les cochés »** garde chaque tâche comme historique (`cleared_at`) et n’efface plus rien ; les listes de départ gardent leur propre « Vider » ; un id `tmp-…` périmé guérit sur la tâche du même nom ou répond 404, jamais un « ok » vide. **Le jour** : un minuit LOCAL du ménage, un seul encodeur (`taskDayOf`) et un seul décodeur (`taskDay`, `functions/_lib/taskDay.ts`). Chaque geste est UNE fonction (`functions/_lib/taskGestures.ts`) ; le client écrit tout par `/api/tasks`, et `/api/chores`, `/api/todos`, `/api/home-projects` ne font plus que traduire les vieilles formes de requête vers le même chemin. **0153** reconstruit l’épine : `kind` vaut `plan`, `upkeep` ou NULL, et un CHECK refuse le reste. **`at` ne se réécrit PAS en SQL** : le décalage dépend du fuseau du ménage (0135, n’importe quel nom IANA) et de son heure avancée, et D1 n’a aucune base de fuseaux. Le Worker le fait (`normalizeTaskDays`, chaque nuit, ménage par ménage, idempotent), et chaque lecteur décode `at` en attendant : ce qu’un ménage voit ne dépend pas de l’heure où ça passe. La règle garde le jour que chaque lecteur MONTRAIT (le jour local qui contient `at`) : un minuit UTC à l’ouest de Greenwich se lisait la veille au tableau, c’est la veille qui reste, et le formulaire l’affiche maintenant aussi. Deux réponses changent, toutes deux par la décision 3 : la fenêtre « Bientôt » compte depuis minuit, et une série cochée le jour même AVANT l’heure de son ancre n’est plus « en attente » le lendemain (Thermopompe, mardi soir, dans l’instantané). Exercice : `worker/taskKindShrink.d1.test.ts` (2e base à 0152, trois fuseaux, chaque côté de chaque changement d’heure, identité et jour AFFICHÉ de chaque tâche et de chaque case du calendrier avant/après, le vrai Worker avant et après la réécriture ; trois plants rouges). Garde : `task-faces-rule.test.ts` étendue (plus de `'chore'`/`'todo'` près de l’épine, `FACE` = tâche · maison, le CHECK, un seul encodage du jour ; sept plants rouges). Déploiement : la première nuit réécrit les jours ; la sauvegarde de cette nuit-là les a encore tels quels. **La vue Tâches, désencombrée (même jour)** : le champ d’ajout rapide, puis UNE rangée de boutons (« Trouver quoi faire » et « Idées de saison » ouvrent chacun leur panneau sous la rangée, un seul à la fois, la forme du « Filtrer » des recettes ; « Tâche détaillée » ouvre le formulaire complet ; « Une chose à moi » seulement dans la lentille Sujet), puis les tâches. « Qui a fait quoi » ne vit plus que dans la lentille Personne. Une `Chip` `expanded` s’allume tant que son panneau est ouvert. e2e : `task-effort.spec.ts` « the action row » (plant rouge : le journal remis dans toutes les lentilles). Puis (même soir) les tâches EN TÊTE : la lentille, la liste, et seulement dessous le champ (son ＋ dans le champ, `TaskQuickAdd compact`) et la rangée, les ajouts d’abord ; les mots du frigo et la « Boîte aux lettres » quittent la vue Tâches (ils restent sur les autres vues) : à 390px, quatre tâches au premier écran au lieu d’une et demie. **Le 2026-11-11** : la rangée d’une tâche n’est plus que son allure, son titre et sa coche — le jour, « En attente depuis », le tour et l’effort passent dans l’aperçu ; TOUTE tâche se coche, n’importe quel jour (fait d’avance, c’est fait) ; les lentilles sont trois pictos sur une ligne avec un petit ＋ jaune qui descend au champ d’ajout ; la rangée du babillard (heure, date courte, visage, les cinq vues en pictos : `Segmented collapse="icons"`) tient sur UNE ligne à 390px. Et l’aperçu ne s’ouvre plus en lamelle : `.sheet` se plafonnait par `--vvh` en tout temps, et un `--vvh` périmé (iOS) le coupait ; il ne s’y lie plus que sous `.kb-open` (`keyboard-fit.test.ts`, plant rouge : l’ancienne règle remise). e2e : `task-effort.spec.ts` « a row is its title… », « one line… ». Puis l’aperçu (même jour) : il porte l’allure et la teinte de la rangée (`buildChore` `look`, la couleur de qui), et ses faits tiennent sur une carte douce (bloc `facts`) : « Équipe » en visages (le nom seulement sans photo), « Effort » en points ●●●○○.

### Le plan de solidification — vagues 0 à 5 closes, vagues 6 à 8 livrées en partie, le reste est ouvert en §4 — 2026-11-05
Three read-only audits (components/CSS · flows · tests/guards) on 2026-11-05 found the drift the ~30 guards do not cover — the same concept built two to six ways (23 copied « Chargement… » lines, 8 copied avatar blocks, the `.operator__seg` settings row ×123 with no component, 0 z-index tokens, `--danger`/`--ok` used and never defined), flows that differ by section (a meal undo that drops the recipe link, sheets that ignore the phone's back button, a kiosk shown doors the server 403s), 45 e2e specs each with their own `boot`, 192 hard waits, a `health` mock drifted from its handler, nine PARITY dimensions « manual only ». **The plan is `plans/2026-11-05-SOLIDIFY.md`** — nine waves, scope-complete by Marc's word (« doesn't matter the number of days »), no business-logic change beyond the five audited flow bugs. **Wave 0.1 landed:** `oxlint` gates CI right after typecheck, CORRECTNESS category only (`.oxlintrc.json` carries each `off` with its reason — the React-Compiler rules fired 110× asking for refactors, not fixes; `unicorn` is style). The baseline found three conditional hook calls (SouvenirsCard, CoOperatorsSection, takeout — a hook after an early return), ten comma-expression statements, two useless escapes; all fixed without a behaviour change (`useMots` grew `enabled` so the guest branch keeps its hook AND its silence). `lint-disable-rule.test.ts`: an `oxlint-disable` without ` -- <reason>` fails the build (planted red on traceFont:114; the gate itself planted red with a `debugger`, exit 1). Next: 0.2 tokens, 0.3 `useLens()`, 0.4 the e2e fixture + typed wire, 0.5 the overlay API + back button. **Wave 0.2 landed:** the token file now defines THE overlay scale (`--z-sticky` 10 … `--z-drag` 1200, 22 tokens; 25 literal z-index ≥ 10 migrated, 0 left; the prose WHY stays in capture.css) and names the three canonical breakpoints; `--danger`/`--ok` (12 sites, defined NOWHERE, each rendering its own off-palette literal) and `--muted` (3 sites, two with no fallback → `color: initial`) now resolve to the palette's own `--warn`/`--success`/`--ink-soft` — the one deliberate colour nudge of the wave; 280 fallbacks on always-defined base tokens removed (15 × a teal hex under `--accent`, 4 × the pre-contrast-fix marigold — none ever rendered, all lied). `tokens.test.ts`: an unresolved `var()`, a fallback on a base token, a literal z-index ≥ 10 each fail (three plants, each red on its named line — the first plant did NOT land and the check caught it); ratchets pinned: 24 distinct @media widths, 267 hex literals in ts/tsx. `layer-order.test.ts` resolves the tokens. **Wave 0.3 landed (two commits):** `useLens()` in `lib/audience.ts` is THE place that says what each audience sees and does — 46 inline `audience === …` sites migrated onto named flags (toddler · simple · parent · teaches · interrupts · acts · spoken), first WITHOUT a flip (8686b535, every site keeps its behaviour), then the flip by Marc's decision: the « simple » lens TEACHES (help dots, intros) and ACTS (the loupe, « Demander », edit/share on a peek, the recipe sheet no longer read-only) but is never INTERRUPTED (no auto-tour, no habit prompt, no AI toast); the toddler lens gets none of the three; board-layout edit stays parent-only. Before this the simple column was per-file luck (three sites showed it help, six hid the doors). `lens-rule.test.ts` fails a new inline comparison (red on the pre-migration tree, 46 lines named) and a `kid`/`isToddler` flag; `e2e/lens-gates.spec.ts` holds the 3×3 table — red on the unflipped tree (simple: no loupe), green after. Next: 0.4 the e2e fixture + typed wire, 0.5 the overlay API + back button. **Wave 0.4 landed:** `e2e/fixtures.ts` is THE boot (`app.boot({ route, state, api, clock, viewport, wait })` — reduced motion and the four-key seed by default, everything else opt-in), proven on cercle-crud / composer-fit / coverage (55/55; the other 42 own `boot`s migrate in wave 6); `functions/_lib/wire.ts` types a handler's answer ONCE and `e2e/mocks.ts` is typed against it — `health` first: the fixture had 4 of the handler's 15 keys (`photos`/`realtime`/`cloudOcr` always falsy in every browser test), now all 15 with today's effective values, and deleting a key is a `tsc` error (planted: `realtime` removed → TS2741); `mocksContract.test.ts` reads the Worker's route TABLE as text — a fixture for a route that does not exist fails (planted `healthz`), and routes without a fixture are a ratchet at 83 of 127. **Wave 0.5 landed:** the phone's BACK BUTTON closes the overlay instead of leaving the page — `useModal({ history: true })` holds one same-URL entry per open overlay (pushes and pops in strict sequence: an overlay opening in the tick another closes used to have its entry eaten by the pending pop — five reds on the first run), opted into by Modal · Sheet · confirm · ActionMenu · ZoomableImg · FlyerViewer · FlippPager and NEVER by a routed scene (the router owns its entry; DrawPad keeps its own back-BLOCKING sentinel); `Modal` gained an accessible name (`title` → aria-labelledby, `ariaLabel`), `footer` (THE button row) and `size`; `Sheet` gained `title`; `SceneHead`'s `onClose` is optional and `backTo` draws a ← (the five hand-copied heads fold onto it in wave 3; the title class is `scene__head-title`, `pm-sheet__title` aliased until then); the AI-error toast stopped calling itself an alertdialog; RoutineRunPage got Escape. `overlay-rule.test.ts`: a `role="dialog"` or a `useModal(` outside the three shells needs a reason (planted red on SectionIntro:82); `e2e/back-closes-overlay.spec.ts` (6 cases on the new fixture) — red with Sheet's entry off (back left the page: the old bug), green with it. **Wave 0 is done; wave 1 (the flow bugs) is next.** **Wave 1, first batch (1.1 · 1.2 · 1.4 · 1.5):** « Retirer du plan » undoes through the owner (`restoreMeals`) and the board/month payloads now carry `recipe_id`, so the link survives the round trip (`EntityRemovals.test`; `write-owners` refuses a hand-rolled meals POST in an `onUndo`); `recap.ts` and `suggest-meal.ts` step local days with `addLocalDays` (`localDay-rule.test`: a midnight ± n×86400 fails — its first draft flagged a `/ 86400` day COUNT and was narrowed); an emptied note is deleted WITH an undo (`undoTier`: a family-notes DELETE must be held or undoable); and the real 1.4 — 36 handlers are `authed(…, 'operator')` (my first grep missed the multi-line calls and said two; the audit was right) — `lib/device.ts` `needsOperator()` = guest OR paired kiosk, gates ~20 files (virements, habits delete, the voyage scenes, transfer forms, family share, place import, sample data, `thisWeek` flipped to an operator-only section), `operator-doors.test.ts` derives the set from the handlers and pairs every client call site with it (ALLOWED carries the why for Réglages bodies under `access: operator` and surfaces that render on `signedIn`, which is an OPERATOR session only), `e2e/kiosk-doors.spec` with an operator control per door. **The « pre-existing » CI reds were real bugs, both ours** (fff40086): `recipeVersions` read ANY pair of same-named sections (ingredients + steps) as an alternative, so the commonest sectioned recipe (« Biscuits » / « Glaçage » in both lists) opened with an EMPTY base view and the picker said « Ajouter (0) » — a pair is a version only when its title says so (`isVersionTitle`); and `month-day-panel.spec`'s stub seeded its day at `from + 20 * 86400`, the documented DST trap, red since the fall-back Sunday — `addLocalDays`. `config-panels:264` is the lazy chunk's cold compile (7 s alone, > 15 s as the 11th test of a cold shard): budget doubled. **Wave 1, second batch — wave 1 is DONE (2026-11-05, evening):** 1.3 verified (ActionMenu already rides `useModal({ history })`, the ＋ sheet's pickers are in-sheet views, `back-closes-overlay.spec` covers both). 1.6 `loadStateOf(q, { shape? })` / `<LoadState q>` in components/Fallback.tsx is THE pre-data decision (no data + error → LoadError with a retry; no data → Skeleton when the shape is known, else Loading); 24 sites adopted, among them the two FALSE EMPTIES (La liste, La cuisine rendered the empty surface on a failed cold read) and two import pages whose « introuvable » was a lie on any non-404 failure; `load-error-rule.test.ts` (planted red on CercleFormPage); `error-paths.spec` drives nine routes through a 500 → « Réessayer » → recovery. 1.7 three DELETE-then-re-POST undos (the day scene's meal, the Réglages list template, the morning's emptied note) ride `useDeferredRemoval` — the row hides, the write waits behind the toast, « Annuler » un-hides the SAME row (the re-POST minted a new id and left every reference dangling); the day note stays compensating and says why (keyed by date); `undoTier.test.ts` refuses the shape (planted red with the old template delete, and it found the note). 1.8 a drag is never the only door: the meal row ⋯ gains « Déplacer… » (the shared day + slot picker in a Sheet → `reschedule`, undo = the inverse move) and the family builder's face chips gain ⋯ « Placer » (bands + tray); ACTIONS.md's four rows now say which mirror; `dnd-mirror.test.ts` (inventory, planted with a scratch host) pairs all 16 `usePointerDnd` hosts with their mirror; `dnd-mirrors.spec` drives both, mouse only. 1.9 the plan's « hidden-scrollbar rows » were visible-scrollbar rows whose real defect was the wheel: seven elements (cook rails, recipe filters, DrawPad's template pickers) take `useHScroll`; `src/styles/hscroll-rule.test.ts` pairs every « flex + overflow-x » CSS class with a `ref=` on its JSX host (token-bounded — its first draft read `rail` inside `cook__timer-rail`; planted red twice). Also: `kiosk-doors.spec`'s virements control counted doors by TEXT, and every door is an icon-only button named by aria-label — red from the day it shipped, now by role. **Wave 2 is DONE (2026-11-05, evening — six commits, 2f6586cd → 1197720a):** the mechanical sweeps, each with its guard planted red. 2.0 `kit-class-rule.test.ts` — a class TOKEN with an owner may be spelled in a `className=` only by its owner (`classNameValues` lifted into `buildGuardScan`, pinned against a fixture that carries a union type, a gallery keyword and a demo label); tokens owned so far: `loading`, `avatar*`, `searchfield*`, `btn--icon`. 2.1 the 22 hand-spelled « Chargement… » lines → `<Loading>` (now takes children) or `loadStateOf` (nine were a query’s wait); `router.tsx` had its own `function Loading()`. 2.2 `Avatar` takes `photoUrl` · `className` · `decorative` · `shape`; eight hand-rolled face discs folded onto it; `avatar-rule.test.ts` refuses the initial-fallback idiom as a JSX child (its first draft read six capitalize helpers and was narrowed). 2.3 `EmptyState size="cell"` (terse, no guide link) + `StatusMessage live/as`; eleven cells and nine raw `role="status"` lines folded, seven one-rule CSS classes gone; `empty-rule` + `status-rule`. 2.4 `SearchField size="sm" / onSubmit`; five raw search inputs folded; `search-rule`. 2.5 **`IconButton`** — the one justified new primitive: `label` required (two ＋ shipped nameless), ghost · solid · bare, md · sm; 31 `.btn`-family glyph buttons + the three shells’ closes ride it, the close classes hold position only; `icon-button-rule` (hard on a nameless glyph, ratchet 115 on the hand-spelled families). 2.6 one `.btn` spelling — btn → tone → size → layout → mono → page; 29 literals folded; `btn-order` (ratchet 92 distinct). **Correction (same day):** this entry first claimed every [visual] step had been looked at; it had not. Most matrix frames of 2.2, 3.1 and 3.2 were captured but not opened, and four surfaces had never been seen (recipe hearts, emoji search, cashier ✕, PanZoom). All were then reviewed as before/after contact sheets and individually: no regression; the one real change is the lighter labels of the list editor (3.1). Also: 3.2 folded every pill in ONE commit against the plan's one-pill rule, on the grounds that no class changed; and 1.3's nested-picker question was only answered by `e2e/segmented.spec.ts` (back from a drilled ＋ sheet closes the sheet). **Wave 3 so far:** 3.1 `Field` (102 sites), 3.2 `SettingsRow` (42 rows), 3.3 `Segmented` — the first `role="radiogroup"` in the app, one tab stop + arrows, over the five settings pickers, the board view, cook view and density, the ask modes, the draw tools and DevKit's axes; cook's two tab rows moved to `SubTabs`. Deliberately NOT folded, each with its reason in `segmented-rule.test.ts`: the Réglages sidebar tablist (a vertical nav with one hue per tab), plus `habit-form__seg` (native radios already), the emoji and sticker grids, `draw-choice`. 3.4 the five public pages fold onto `SceneHead` (the `pm-sheet__title` alias went). 3.5 the name says the shell: `AskDialog`, `FlippDialog`, `EmptyFridgeDialog`, `RecipeScene`; four button rows moved into `Modal`'s `footer` (`overlay-naming.test.ts`). 3.6 `CheckDisc`, `SharedMark`; hand-spelled `row-actions__btn` → `IconButton`. 3.7 one word per gesture: `onClose`, `onSelect`, `Toddler*` (`prop-naming.test.ts`). **Wave 3 is DONE, with four deliberate departures from the plan:** `RecipeBookPage` gets no head (the toddler book has its own ✕); La liste's and the todo rows stay off `<Act>` (grip, swipe pane and in-place rename do not exist there — forcing them would fork it); pet and business rows get no `RowActions` (edit and delete live in the peek, like a person's, and compact rows removed that furniture); the Réglages sidebar keeps its own tablist. **4.1 landed** (views in the URL; the `?focus=` timer no longer undoes a quick tap). **Next: 4.2** search landing · 4.3 board « ? » · 4.4 entity parity · 4.5 copy, then waves 5 to 8. **Vague 4 :** Un résultat de recherche atterrit sur sa rangée (`lib/searchLanding`, `useItemPulse`). Chaque carte du babillard répond au « ? » (15 entrées `card-<id>`). `/voyage` liste enfin les voyages, derrière la même porte opérateur que la scène d'un voyage. Le premier mot de Maison suit la pastille. La lentille `simple` a 5 états de matrice : Réglages en est absent parce que cette lentille renvoie `/settings` au babillard. « Supprimer » veut dire disparu, « Retirer » veut dire que ça quitte l'écran, et confirmCopy + glossary tiennent les deux règles. Un `confirm()` prend une clé `…Confirm`, jamais un nom. **Vague 5 :** 238 règles mortes parties, un nom par mouvement, 14 largeurs de @media au lieu de 24, et `#root` ne réserve plus de gouttière dans un hub. Les 54 blocs façon Cluster, 48 ellipses et 28 `flex: 1 1 <longueur>` sont à cliquet : ils fonctionnent, et les balayer ne changerait rien à l'écran.

## 4. What still needs improvement — consolidated and ranked

**Ouvert depuis le plan de solidification (2026-11-05)**, chacun tenu par un cliquet ou un test :
- [x] Une seule notion de tâche (`plans/2026-11-06-TACHE-UNIFIEE.md`), phase 1 : les corvées passent par `_lib/upkeep.ts` (`choreSchedule`, `taskSchedule-rule`). Rien de visible. Phases 2, 3, 3b et 4 livrées (§3), la fusion des tables comprise (0150, 2026-11-08). Les vues sont alignées (2026-11-08, §3). `kind` → `plan | upkeep | NULL`, un seul geste et un seul jour (0153, 2026-11-10, §3) : plus rien ne distingue une ancienne corvée d’un ancien à-faire.
- [x] Les specs passent à `app.boot` : plus aucun `boot` local, et `waitForTimeout` tombe de 199 à 80 (`e2e-rule.test.ts`, BOOT_MAX 0). Une photo ou une mesure finale attend `settled()` (`e2e/measure.ts`) : la page a cessé de bouger. Ceux qui restent sont une durée voulue : un appui maintenu, ou la preuve que rien n'arrive, chacun avec sa raison en commentaire. 6.1 et 6.2 (2026-11-06) : `interactions.spec` et `config-panels.spec` sont découpés par surface (12 fichiers, 129 titres identiques, `e2e/interact.ts`). `ROUTES: Partial<Wire>` tient 64 fixtures par `tsc`, et les 64 handlers GET y sont liés par `okWire('route', body)` (`functions/_lib/json.ts`) : `tsc` refuse une clé perdue et, à toute profondeur, une clé inconnue de `Wire`, et `mocksContract.test.ts` compte les routes non liées (0, `UNBOUND_MAX`). Reste invisible : une colonne ajoutée à un `SELECT` sans toucher son `Row`, puisque `.all<Row>()` est un cast ; `any` et `unknown` arrêtent aussi le contrôle à leur profondeur. Les routes GET sans fixture passent de 35 à 15, chacune nommée avec sa raison (`mocksContract.test.ts`). Un GET inconnu répond toujours `{}`, et `e2e/unknownGets.reporter.ts` fait échouer une exécution sur un chemin hors de `e2e/unknown-gets.json` (2 chemins, plafond dans `docCounts`).
- [x] Les 17 routes sans test positif sur vrai D1 en ont un, et `UNTESTED_MAX` est à 0 (`worker/d1Coverage.test.ts`) : une route sans test sur vrai D1 fait maintenant échouer le build. `functions/test/fakes.ts` scripte le modèle derrière `runModel`, donc le compteur `usage_daily` reste le vrai, et `fetch` ; un appel non scripté fait échouer le test (`worker/aiRoutes.d1.test.ts`, `worker/outbound.d1.test.ts`, 68 tests). Correction de cette case : `AI: ''` et `BROWSER: ''` ne faisaient rien, `wrangler.toml` l'emporte, et `env.AI` était le vrai binding, qui lance « needs to be run remotely ». Un vrai bogue trouvé : `recap` envoyait les soupers à venir dans le bilan de la semaine passée (`functions/api/recap.ts`, même borne que les événements). Le chiffre « 67 » d'avant était faux : la regex ne lisait pas les 45 clés raccourcies de TABLE, le vrai compte était 97.
- [x] `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` sont allumés dans les trois tsconfig. oxlint reste en `correctness` : `suspicious` + `perf` donnent 8 441 faux positifs d'une seule règle, et `iframe-missing-sandbox` casserait le lecteur PDF de `CarnetDocs`. Décision prise, à ne pas rouvrir sans nouvelle mesure. `exhaustive-deps` est passé en erreur le 2026-11-06 : la revue de fin a trouvé cet item du plan oublié, et un vrai bogue dedans (`tagSlots` absent du mémo de la cuisine).
- [x] 7.1 : les 13 modules ont leurs tests, chacun vu rouge. `@testing-library/react` est là, et `npm run test:coverage` tient un plancher par dossier (`src/lib` 62,58 % de lignes) dans `vitest.config.ts`. Hors CI : personne n'a demandé d'en faire une barrière. Deux vrais bogues trouvés : un instantané effacé à la perte d'auth se réécrivait (`persist`), une écriture retenue partait deux fois au démontage (`toast`).

> **No open box.** Not here: the repo's open boxes are `REVIEW-TRACKER.md`'s (2026-11-17). La dernière d'ici s'est fermée le 2026-11-06. Avant elles, 2026-09-29 : §K's six waves and §L are all closed; what is left is §M
> (needs a device) and F37's review (~12-29). New work starts from what real households do.
>
> **The standing work since 2026-11-05 is `plans/2026-11-05-SOLIDIFY.md`** — nine waves of
> UI/UX unification, generalization and test hardening (§3 has the latest wave). It is a
> plan with no boxes on purpose: each wave's items are verified in code when picked up, and
> a wave is done when its guards are green AND were red once. Read it before any UI work.

> **Everything except §K is closed.** The argument, the measurements and the several
> findings that turned out to be wrong are in git (`git log --diff-filter=D -- bmad/` finds the deleting commit; `git show <sha>^:bmad/<file>` reads any of it.). One line each here,
> with the verdict:

| § | What it was | Verdict |
| --- | --- | --- |
| **A** | Verified correctness — the `useWrite` sweep, `/share`'s lost writes | ✅ done 2026-08-27 |
| **B** | The friction pool (the friction audit), tiers 1–3 | ✅ closed 2026-08-28; four of five tier-3 items were already stale |
| **C** | Section debt (`REVIEW-PASS.md`), swept four times | ✅ closed 2026-09-09, 31 → 0 |
| **C-bis … C-undecies** | Eleven rounds reported from the device, 2026-08-28 → 09-03 — list items resurrecting, dead calendars, the day scene's shape, the photo→recipe read | ✅ all closed; the durable ones became guards (`tmpIds`, `healOnError`, `repairImperialFromMetric`) |
| **D** | Judgement calls waiting on Marc | ✅ all answered — pinch-zoom off, calendars retired, the supper hero left alone. **Declined, not deferred: do not re-propose without a new observation** |
| **E** | Tooling gaps found during the cleanup | ✅ closed — `knip` wired into CI, its signal configured down from 58 findings to 7 |
| **G · H · I · J** | Four passes that LOOKED: the 100-screenshot review, what the sweep could not see, the frames re-read, and fresh eyes on the a11y census | ✅ all closed; `color-contrast` went 78 states → 0, and the sweep learned to prune, shoot below the fold, and rebase its fixtures |
| **L** | The public-app hardening pass — thirteen items, 2026-09-16/17 | ✅ 31 boxes closed, 1 parked. Sessions, rate limits, a real-D1 harness, the door's eager graph, password-gated doors, security headers, nightly alerts, a restore door, the weekly stranger walk, the household timezone, Dependabot |

**§L's last thread — the CSP is ENFORCED (2026-09-22), the report-only twin dropped 2026-09-25.** The week of reports found one
thing, and not ours: the edge injects inline scripts into the door, so `script-src` keeps `'unsafe-inline'` and every other
directive is enforced (`securityHeaders.ts` carries the why). `frame-ancestors` now also admits marcportal.com (2026-10-15).

### K. Towards a public app — the plan, written 2026-09-16 (start here)

**Marc: « a way towards being a public app soon ish (months away prob) ».** Decisions
taken the same day, which shape everything below: **no zoom, ever** — the layout must use
the space on every media type (§D); **signup stays invite-gated** until the last wave;
**email goes through Resend**, which Marc's portal project (`anthropicJoffre`, its
`backend/src/utils/emailService.ts`) already uses — an account exists, a Worker calls the
REST API with plain `fetch`, no SDK.

Six waves, in order. Each wave ends with the standing gates (typecheck · test · build ·
the matrix run · a PARITY row or a footnoted ➖ · STATE.md updated in the same commit).
The boxes below are OPEN WORK and count in §2's number; flip them with the commit that
settles them. A wave's findings get their own boxes under it when the wave starts.

**Wave 0 — the wide-screen pass. ✅ CLOSED 2026-09-16**, and the expectation going in was
wrong in the good direction: six surfaces already sat in a centred column or a sidebar
layout, and only three tabs stretched edge to edge. Marc's call was **HYBRID — width
where the shape earns it, a reading column where it does not, and centre the tab bar**,
applied as four surface-agnostic `@media (min-width: 1100px)` rules. The matrix grew
`TABLET` (820×1180) and `DESKTOP` (1440×900, surface `mobile` — a laptop operator, not
the wall) plus 17 states. One thing no 390px frame could ever have shown came out of it:
the board's « Faire » pill at **2.03:1** on a marigold member, which `tintInk()`
(`lib/routineTod`) now answers. Two things were seen and PARKED with the why (the ＋ FAB
over the fourth column; Maison's empty lower third, which is the fixture's size). The
five boxes and their measurements are in git.

**Wave 1 — the stranger's demo walk. ✅ CLOSED.** Walked twice on production by
Playwright, as a stranger, on a laptop and an iPhone. **The clock was never the problem**
(landing 0.4–0.8 s, mint → board 0.8–1.2 s, the first write settled in 70 ms); the first
screen was. The first walk could not get past it: a brand-new device landed on
« Le point du jour » with the welcome dialog over it and the tour pulling the router back,
because two shell automations both fire on a fresh device — fixed `b2bc7ee6`, the first
day belongs to the welcome, and `first-run-quiet.spec.ts` replays production's timing
(an instant stub let the OLD code pass). The second walk found three more: the marketing
page opened the household realtime socket with NO credential (a 401 handshake forever in
a visitor's console — the socket follows the SESSION now), Découvrir greeted a fresh
sandbox with « Quoi de neuf » about a rename it had never seen, and the first-ever undo
toast covering the row you just added — **accepted by Marc, « they can close the toast »:
declined, not deferred.** The 24 h sandbox sweep was confirmed in production D1 on
2026-09-22: zero aged sandboxes, zero orphaned households.

**Wave 2 — a fresh household, a small phone, a slow connection. ✅ CLOSED.** The fresh
household was already photographed; what had not happened was LOOKING at those frames
with the question. **320px** was the find — the first frames ever shot there had EVERY
tab's title cut (« Bon apr », « La li… »), and it was never the font: a fixed 197px
four-disc header cluster left ~83px for the title, so below 340px the decorative section
avatar hides. Cold start was measured on production under CDP throttling, then re-measured
after the hub went lazy: **78 requests → 17, and the slow-link headline 11.2 s → 7.1 s.**
The last 55 KB came off 2026-09-22; the install prompt shipped. **Re-measured 2026-09-25**
(`npm run perf:door`, presets in its header): **15 requests / 305 KB** on the wire (was 78 /
487), one parallel wave, no chained round trip — bandwidth-bound; the levers left are bytes.

**Wave 3 — password reset. ✅ CLOSED 2026-09-23, verified against production.** Walked end to end on real rows. `reset.ts` bumps `session_version`, so a reset signs out every other device, and the nightly cron can now reach a human by mail.

**Wave 4 — a household can leave, and knows the terms. ✅ SHIPPED 2026-09-22.**
`DELETE /api/household` behind three locks — operator scope, the password (`_lib/sudo`),
and the household's NAME retyped, which is the half a password cannot be: a password is
typed while thinking about something else, a name has to be read off the screen. Folded
under the export, because the first thing to offer someone leaving is their own things.
No undo tier, recorded as a ➖ with the argument (PARITY ¹¹¹). `deleteDemoHousehold` became
`deleteHousehold` in the same commit. `/confidentialite` + `/conditions` ship FR and EN
from the marketing footer and from Réglages, written to be TRUE rather than reassuring —
every claim checked against code that day — and living in their own lazy page, not in
`i18n.ts`. `CONTACT_EMAIL` is the contact door — **set in production** (`app_health`
reports it, 2026-09-29), so the Law 25 prerequisite held when signup opened. Guards: `worker/leave.d1.test.ts` (5, including the
neighbouring household left untouched) + `e2e/leave-and-legal.spec.ts` (6).

**Wave 5 — bounds, then the gate opens.** Both bounds shipped 2026-09-23.

**Daily spend limits (0137)** — two resources cost money per use and nothing counted
them: not one AI endpoint called the rate limiter, and a demo sandbox is a real operator
session, so one unauthenticated POST bought a credential `/api/transcribe` (16 MB of
audio per call) accepted without limit. R2 is rented and the sweep reclaims it; neurons
are burned. **Every** household is capped now, not only sandboxes — a runaway loop in a
real household had no ceiling either (1 000 calls / 2 GB a day against 60 / 50 MB). R2
already had its seam (`uploadR2Media`); AI got one (`_lib/runModel.ts`, 13 raw call sites
converted), and `usageRule.test.ts` keeps both unavoidable. The counter is a single
atomic UPSERT — the naive read-then-write it replaced was planted and counted **1 of 20**
concurrent charges.

**Email verification (0138)** — gates the two doors that reach outside the household
(invite a co-operator, issue a guest link) and nothing else. Fails open where it must:
no mail wired → stamped verified at signup, and the gate no-ops. Existing accounts were
backfilled. Single use proven red; the redeem page survives StrictMode's double mount.

**The examples story is settled (2026-09-23, §3)** — which this box partly waited on: a
stranger now meets ONE story (try → keep, or sign up → an empty household).

- [x] **Open signup — OPEN 2026-09-24**: `SIGNUP_OPEN = "1"` (`_lib/signupGate.ts`), after
      the prep commit `f56bbb9e` split the invite from `LOGIN_PASSWORD`, which stays set.
- [x] **Retire the shared password — DONE 2026-09-25.** Production counted **zero** rows with
      `password_hash IS NULL`; the legacy branch is gone from `login.ts` + `_lib/sudo.ts` (a hash-less
      row is refused; « Mot de passe oublié » is its way in) and the invite code is `INVITE_CODE`.
- [x] **`LOGIN_PASSWORD` is gone from production** — confirmed absent from `wrangler secret
      list` on 2026-09-29; nothing had read that name since `3e16adba`.

**« L'autre parent » (F37) — KEPT, review ~2026-12-29 (Marc, 09-29).** Never used yet (one
operator per real household), kept for the first real couple now that signup is open. At
review, count `operators` per household; still one everywhere → retire it like the calendars.

**Capacity, for the record:** ~100 households on the free tier with realtime on, then
Workers AI neurons are the ceiling, then Workers Paid at $5/month buys hundreds. Not a
blocker at any wave above.

### M. Known limits after the 2026-09-24 pass — not boxes; each needs a device or evidence

- **Keyboard, needs Marc's phone.** Two suspects the code cannot settle: iOS still
  reporting a shrunken viewport after dismissal (the tab bar stays hidden — the
  diagnostic shows `open=true ae=BODY`), and a stranded pan after close (`open=false
  vvT>0`). Réglages ▸ Système ▸ Appareils & accès ▸ « diagnostic clavier », on the screen
  where it happens. Fixed blind and proven by the fake-vv e2e: dialogs and sheets fit the
  visible band, a tall textarea follows its caret line, date/time inputs are pinned,
  « above the band » is corrected too (`997306a5`, `2d9ab542`).
- **Photo read.** An eight-card corpus (`8b059a2c` → `7b20ee09`): the transcriber's
  misspellings (« Broccoli », « SOUPES ») are the model's and the verify screen's to
  catch; the second model still runs in ~3 reads of 16; a bare part label heads a
  section only with a layout signal (blank line, first after the heading, or a common
  part word). The transcript rides in `recipe-vision`'s response so a miss is read at
  the source, not guessed. Re-render the corpus when a new card style fails.

### F. Not a backlog — do not mine these for work

The `bmad/` idea pools are gone with the folder (21 never-built ideas + the lifestyle brainstorms — in git if ever
wanted). `PLAN-mots-and-lifecycle-followups.md` was walked 2026-09-25 and CLOSED (its table carries every verdict and commit). A new idea starts a new pool.

---

## 5. Process review — the lessons that keep earning their keep

Written 2026-08-27 as a long retrospective; its action items are done (the `useWrite`
test, one checkbox convention, the friction tier-1, the finished ledgers moved out). What
remains is the part later sessions keep needing, kept short — git has the full text.

**What works.** Invariants as tests (the build-gating greps in §1 — the pattern that
should absorb every prose rule). Comments that carry the *why*, rejected alternatives
included. Push-to-main behind a ~2m20s gate. Verdicts recorded (`[~]` with the reason)
so a question is not re-litigated.

**What to keep doing.**

0. **A guard that has never been red proves nothing.** `nested-interactive` reported
   green over the very defect it was written for (it walked JSX by indentation; prettier
   put `<div` alone on its line). Plant the violation, watch it fail, restore — **and
   check the plant landed**: on 2026-09-24 two of three `sed` plants were no-ops and
   "proved" a rule until the mutation was re-applied through an exact-match edit.
1. **Ledgers rot faster than they are ticked.** A third of the work picked up on
   2026-08-27 was already done. Before starting an item, grep the claim in code; before
   committing, grep the repo for the other docs naming it.
2. **A review pass after the work is not ceremony.** Three defects in fresh code were
   found by re-reading it cold, not by a red test (an undo painted under the scene that
   offered it, a mis-destructured payload, a frozen nested scroller).
3. **Sweep the rule, not the site.** Fixing « Réglages writes via `api()` » literally
   left `/share` losing data for weeks; a 30-second grep would have found it.
4. **Verify before offering, not just before building.** An option built from the
   documents (« the schema migration window ») had shipped two months earlier.
5. **Effort goes where the harm is, not where the documents point.** §4's ranking is
   the correction; audits are produced faster than they are acted on, so the constraint
   is decisions, not information.
6. **Prose rules drift; only tests hold.** For every cross-cutting rule in `CLAUDE.md`,
   ask whether a test could hold it. For `useWrite` the answer was yes, and it did.
