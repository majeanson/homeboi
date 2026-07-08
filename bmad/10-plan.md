# 10 · Build plan — executing the 16 garde of « La maison qui dure »

> Companion to [`10-la-maison-qui-dure.md`](./10-la-maison-qui-dure.md) (the triaged
> ideas doc: 16 garde · 5 plus tard · 2 rejetés). This file is the **execution plan** —
> per-item shape, files, migrations, tests, effort, dependencies — plus the wave order
> and the decisions Marc gave during planning (2026-07-08). Grounded in seven parallel
> code-level plan passes. **Push straight to `main`, CI gates, fix forward.**
>
> Two stale premises the planning corrected, true as of today:
> - **Realtime is already ON** (enabled 2026-06-17, commit `d1d9b67`, once the account
>   was confirmed Durable-Object-eligible). OQ-5 is therefore already answered; B-11's
>   realtime sub-task closes as "done since June 17" — only the bundle diet remains.
> - **The idempotency ledger is already wired centrally** in `authed()` → B-9 is just a
>   one-key hoist in `write.ts`, not per-handler wiring.

---

## Decisions log (Marc, 2026-07-08 planning round)

| # | Question | Decision |
| --- | --- | --- |
| A-3 | events have no author col | **Include face-less event lines** (« Nouveau rendez-vous : … ») alongside attributed writes |
| C-12 | toddler « Demain » lists raw meals (hidden slots leak, supper twice) | **Align** the kid board to the parent meal rules (fix the bug) |
| C-12 | kid all-clear vs parent-only work | *(decided)* keep two semantics — kid screen "truly empty" is correct |
| D-17 | summer/férié « Congé » every day? | **Silent except edges** (rentrée, dernier jour, relâche, in-term fériés) |
| D-21 | weekly vs biweekly bins | **Ride the existing Corvées/recurrence engine** (biweekly & every-N free); add a "show the evening before" flag. **No new bin data model.** |
| C-14 | Restants strip fold | **Keep a slim one-line hint** beside the Idées opener; full list in the 🧊 chip |
| C-14 | kid-suggestion chip tap | *(decided)* opens the Idées drawer on 👧 (a glance chip never commits a plan) |
| C-13 | screensaver vs board next-up rules | *(decided)* keep both presets (`SAVER_NEXTUP` / `BOARD_NEXTUP`) — zero behaviour change |
| E-22 | v1 retrieval scope | **Include cercle contacts + carnet next-dues** in v1 (not just events/meals/list) |
| E-22 | auto-speak vs tap-to-hear | *(decided)* auto-speak the answer once + a 🔊 replay button |
| D-18 | which kinds can be durable | **Any kind**, with a clear "how to revoke" hint on the mint UI + confirm-on-revoke |
| D-18 | reçu-✓ scope | *(decided)* postbox only for v1, quoting the first few words of the accepted message |
| A-6 | ranking signal | *(decided)* per-device frequents (`lib/frequents.ts`), zero server/privacy surface |
| B-11 | lazy-load EN dictionary | **Yes** — FR eager, EN on demand (~100 kB off boot parse); tsc parity contract kept |
| B-11 | realtime kill-switch | *(decided)* rebuild-flag is fine; no runtime env var now; close sub-task as answered |

---

## Migrations (forward-only; numbers assigned at build time in landing order)

Three new migrations total — **do not hard-code the number**, take the next free one after
the latest on disk (`0105_routine_stickers.sql` today) when each lands:

- **D-17** — `household_preferences` table: `(household_id TEXT /* soft ref */, key TEXT,
  value TEXT NOT NULL DEFAULT '{}' /* JSON */, updated_at INTEGER NOT NULL, PRIMARY KEY
  (household_id, key))`. The DB-6 rule firing at last (`households` is ~15 pref columns).
  Stores `key='schoolYear'`. New `functions/_lib/householdPrefs.ts` (`getPref`/`setPref`).
- **C-14** — `meal_ideas ADD COLUMN date INTEGER` (nullable local-midnight day the idea
  was suggested *for*; soft scope, calm-safe).
- **D-18** — `guests ADD COLUMN standing INTEGER NOT NULL DEFAULT 0`, `ADD COLUMN label
  TEXT`, `ADD COLUMN lang TEXT`.

**D-21 needs NO migration** (rides the existing chore/recurrence tables). **A-3, A-4, B-*,
C-12, C-13, C-15, A-6, D-19, E-22 need none.** `calm-tenets.test.ts` stays green by
construction (no streak/points/badge/push table, no quantity column).

---

## Wave order (dependencies resolved)

**Wave 1 — quick independent wins (no schema, no C-12 dependency).** Parallelizable.
`A-4` · `B-9` · `B-7` · `A-6` · `C-15` · `B-11`.

**Wave 2 — the board seam.** `C-12` (6 reviewable commits; must start with a Simple-lens
screenshot baseline). Blocks the board-content slices below.

**Wave 3 — features on the seam + independent endpoints.** `A-2` (after B-9) · `A-3` ·
`C-13` (Board next-up selector rides C-12) · `D-17` (migration + card + year.ts; the
« Demain » line rides C-12).

**Wave 4 — kitchen + guests + AI.** `C-14` (after C-15 for `helpFromGuide`) · `D-18` ·
`D-19` (after D-18; shared files) · `E-22`.

> **Serial constraints:** B-9 → A-2 · C-15 → C-14 · D-18 → D-19 · C-12 → (D-17 Demain
> line, D-21-if-built, C-13 Board selector, A-3 greeting wrap is trivial either way).
> **Never run D-18 and D-19 in parallel sessions** (both rewrite `operator/guest.tsx`,
> `guest/start.ts`, `guest/window.ts`, `auth.ts`).

---

## Wave 1

### A-4 — « À régler » sur le mur  [S · ~2 h · independent]
Blocker found: `functions/api/a-regler.ts` is `authed(…, 'operator')` → kiosk token 403s;
the client gate at `Board.tsx:947` mirrors a **stale** comment ("fixes are operator
writes" — they're actually navigations a kiosk can do: `/kitchen/day`, `/liste`,
`/cercle`, `/settings?tab=board&sub=thisweek`, none gated).
- Drop `'operator'` → plain `authed(...)`; add in-handler guest short-circuit (`return
  ok({ signals: [] })`) so a sitter never gets the friction scan.
- `Board.tsx:947` → `enabled={audience === 'parent' && !ro}` (locked kiosk is toddler →
  still hidden).
- Update the stale comments (`aRegler.ts:26`, `ARegler.tsx:12`) + the guide copy at
  `guideContent.ts:1824` (drops « sur ton téléphone, pas la tablette murale »).
- **Tests:** e2e `board-customize.spec.ts` — card renders under `?surface=kiosk` parent,
  hidden for toddler/guest. No vitest (no logic change).

### B-9 — Idempotence dès le premier geste  [S · independent · precedes A-2]
Ledger already central in `authed()` (`_lib/route.ts:84`). Fix = one key for both legs:
- `src/lib/write.ts` (`writeWith`): hoist `const key = uuid()` above the online attempt;
  pass `idempotencyKey: key` to `api()`; enqueue with the **same** `key` (not a fresh
  uuid). Closes the "online attempt half-succeeded, response lost, re-tap double-applies"
  hole.
- `src/lib/api.ts`: add `replay?: boolean` to `Options`; the guest read-only backstop
  (currently keyed off key *presence*, `api.ts:73`) tests `opts.replay` instead;
  `outbox.ts` replay passes `{ idempotencyKey: e.key, replay: true }`. Update comments.
- **Scope:** `writeWith` only; direct `api()` writes stay keyless (no retry loop → a key
  would dedup nothing and cost a D1 round-trip). The `replay` flag makes adding keys to a
  future direct caller a one-liner.
- **Tests:** new `src/lib/write.test.ts` (online attempt carries a key; transport failure
  enqueues the SAME key; guest still short-circuits). Extend `offline-outbox.spec.ts`.

### B-7 — La ligne de vérité  [S/M · independent]
Staleness stamp independent of `navigator.onLine` (captive portal / Worker outage today
shows a silently stale board).
- `src/lib/query.ts`: `export liveInterval` (already folds awake/asleep × realtime gears).
- `src/lib/online.ts`: add `useDataFreshness()` + a **pure** `isStaleAt(newestMs, nowMs,
  gearMs, anyFirstRetryInFlight)`. Aggregation = `max(dataUpdatedAt)` over queries tagged
  `meta.live === true` (external feeds opt out). Threshold = `max(3 × liveInterval(),
  90_000)` → idle gear (120 s) trips at 6 min, so a healthy idling kiosk never trips.
  Suppress while a live query is fetching with `fetchFailureCount === 0` (kills the
  resume-from-background flash without a debounce timer).
- `src/components/OfflineBanner.tsx`: second condition — `online && stale` renders the
  same `.offline-bar` (optional `--stale` tint) with one line « Données de HH:MM » + the
  pending count. True-offline banner still wins. Mounted in HubLayout → kiosk + mobile.
- i18n: `offline.stale` (« Données de » / "Data from").
- **Tests:** vitest `isStaleAt` table; **manual verify** (cheaper than e2e): `cf:dev` →
  DevTools request-blocking on `/api/*` (stays "online") → line appears ≤90 s → unblock →
  leaves. Optional e2e with `page.clock.fastForward`.

### A-6 — « Joindre » phone-book rail  [S · ~½ day · independent]
One-tap quick-dial rail atop Le cercle on mobile.
- **New** `src/lib/joindre.ts` (pure `rankJoindre(people, businesses, scores)`:
  eligibility = has `phone` (tel:) or `email` (mailto:); order = `frequentScores('joindre')`
  desc; cold start = `urgence`-tagged → members-with-phone → businesses → others,
  alphabetical; cap 8; business keys prefixed `business:<id>`) + `joindre.test.ts`.
- **New** `src/components/cercle/JoindreRail.tsx`: `Rail` of `<a href="tel:…">` anchors
  (Avatar/storefront icon + first name + phone glyph); `bumpFrequent('joindre', key)` in
  onClick. Render only `surface === 'mobile'`, `≥2` eligible, hide for `isGuest()`.
- `src/pages/Cercle.tsx`: mount under `HubHead`; widen the `BUSINESSES_KEY` query type to
  include `phone` (endpoint already returns it); add `bumpFrequent('joindre', …)` to the
  existing `Row` quick-links; `BusinessesTab.tsx` tel anchor too (so real reach-outs feed
  the ranking before the rail is used).
- CSS: append `.joindre` to `cercle.css` (never reorder styles.css). i18n:
  `cercle.joindreTitle`. whatsNew `joindre-rail` (card `cercle`) + one guide sentence.
- **Tests:** vitest `joindre.test.ts`; e2e in `cercle-visual.spec.ts` (rail on mobile with
  tel: hrefs, absent at kiosk) + phone-width overflow sweep.

### C-15 — Trois pinceaux, un pot (+ P2-9)  [S · precedes C-14]
Fold kitchen Réglages colour subs → one « Apparence »; source help one-liners from guide.
- `src/pages/Operator.tsx`: `subSections.kitchen` → `[apparence, meals, reserve]` where
  `apparence` stacks the three existing `OperatorSection` bodies (`RecipeTagsSection` +
  `RecipePillsSection` + `MeasureColorsSection`) — the shipped board▸thisweek /
  settings▸system precedent (stacked sections under one pill, no nested SubTabs).
  `apparence` first (so it's the `useTabParam` fallback).
- Legacy: add `LEGACY_SUB = { kitchen: { tags:'apparence', pills:'apparence',
  measure:'apparence' } }` consulted in the fallback (documented, order-independent);
  retarget `LEGACY_TAB.recipes` → `sub:'apparence'`. Nothing 404s.
- **P2-9:** move/export `guideWhat` into `lib/guideContent.ts` and add `helpFromGuide(card,
  point?)` (point → that point's `detail`, else the card `what`); throws on bad id at
  module load (same class as `guideWhat`). Convert the `ADD_HELP`/`CERCLE_HELP` entries
  that merely restate the guide; leave genuinely-contextual bubbles bespoke.
- i18n: `operator.kitchenLookTitle` (« Apparence »). Record the **standing rule** (new
  setting merges into an existing sub, never a new pill) in CLAUDE.md/COMPONENTS.md.
- **Tests:** e2e `settings-aliases.spec.ts` (three `?sub=tags|pills|measure` + `?tab=recipes`
  → Apparence) + `settings-sections.spec.ts` pill-list update. `helpRegistry.test.ts` covers
  the help re-keying.

### B-11 — Le régime tablette-cheap  [M · three independent sub-tasks]
1. **Realtime — CLOSE as answered** (live since `d1d9b67`, 2026-06-17; poll gears already
   relax on connect; kill-switch = re-comment wrangler binding + flip flag). One doc note,
   optionally a prod smoke check (`/api/live` → 101; second-device write nudges the board;
   `e2e/realtime.spec.ts` exists).
2. **Bundle chunks** — `vite.config.ts` `manualChunks`: `react-vendor` (react/-dom/router)
   + `i18n` (src/i18n.ts) so the mis-named "Icon" commons chunk shrinks and vendor caches
   across deploys. Then **lazy-load EN** (per Marc): keep `const EN: typeof FR` in its own
   module (tsc parity preserved), dynamic-import only when `lang==='en'`; FR renders the
   first frame. ~90–110 kB off the eager parse path. Update `scripts/check-bundle.mjs`
   budgets. (Icon itself is already optimal — hand-inlined paths in `lib/pipIcons.ts`.)
3. **CSS** — do **not** split the order-load-bearing `pages/`/`sheets/`/`board/` slices.
   Move only the self-declared "position immaterial" imports (`cercle` 56 kB, `carnets`,
   `voyage`, `cast`, `partage`, `handoff`, `intake`, `devkit`) into their lazy page modules,
   **one file per commit** (screenshot sweep bisects regressions). ~25–30 % of built CSS
   off the eager path. Add `/^assets\/DevKit-/` to `ONLINE_ONLY_CHUNKS` + `check-bundle.mjs`
   (dev-only gallery, accept no offline /dev/kit); `guideContent` stays (real offline surface).
- **Tests:** `check-bundle.mjs` budgets; screenshot sweep guards the CSS moves; typecheck
  guards the EN parity.

---

## Wave 2

### C-12 — Un seul modèle du babillard  [M · blocks Wave 3 board slices]
Extract one pure view-model behind parent/toddler/Simple lenses.
- **New** `src/lib/boardModel.ts` — pure `buildBoardModel(input): BoardModel` + thin
  `useBoardModel()` hook + `NEXT_UP_GRACE_SEC` (was `1800` spelled twice). Output carries:
  fête-merged/face-filtered/pending-filtered/visibility-filtered/sorted arrays
  (today/tomorrow/upcoming events, chores, todos, home, leftovers, work), `meals`
  (`tonight`/`tonightAll`/`tomorrowSupper`/`otherToday`/`otherTomorrow`), `nextUp`, the
  `fil` partition, and the emptiness flags `dayClear` / `kidAllClear` / `hasTomorrow`.
  Model-side = existence/emptiness/next-ness + past flags (`itemLife`) + day keys from
  `input.nowMs` via `localDayStart` (never a hidden `Date.now()`). Lens-side = all JSX,
  pictos, greeting, speak, peek wiring, per-device card visibility.
- **New** `src/lib/boardModel.test.ts` — the testable seam (dayClear/kidAllClear condition
  loops, meal visibility, face lens incl. `team` rotation, fêtes merge+sort, nextUp grace
  boundary, past thresholds, pending-undo removal, midnight/DST re-bucket, hasTomorrow).
- **Landing (commit-sized):** (1) add `'simple'` to `screenshots.spec.ts` SURFACES →
  baseline for all three lenses *before* refactor; (2) model + test, zero callers; (3)
  wire parent+toddler (`useBoardModel` above the early returns — hook-order law; the kid
  one-way door means the toddler branch is the only code some devices run); (4) SimpleBoard
  consumes `{ model, greet }`; (5) **align toddler « Demain »** to `model.meals.otherTomorrow`
  + `tomorrowSupper` (the decided bug-fix); (6) *optional* extract `ToddlerBoard.tsx`.
- **Gotchas:** pass the `MealPrefs` object through (don't re-derive — kiosk resilience);
  fêtes stay synthetic `fete-*` rows (consumers keep guarding `e.holiday`); don't
  over-memoize (Board rebuilds every minute anyway); E2E is post-merge signal — land
  commit 1 first.

---

## Wave 3

### A-2 — La capture tient parole  [S · after B-9]
Queue failed AI captures through the outbox (option **a**: enqueue raw text to
`/api/capture` for replay — server routing/`parseWhen` stays server-side; `/api/capture`
is `authed()` so it inherits the central idempotency B-9 hardened; `pantry-low`'s two
inserts are a `DB.batch`, atomic).
- `src/components/AddSheet.tsx` submit: delete the offline early-return; replace
  `api('capture', …)` with `write('capture', { method:'POST', body:{ text, forceType,
  undo }, affectedKeys: CAPTURE_KEYS })`. Handle `{queued:true}` → clear input + info
  `StatusMessage` (`capture.queued`), no routed/undo; `{data}` → today's routed/degraded/
  undo flow; `ApiError` (incl. 5xx) → today's `captureErr`. Keep `VoiceButton` offline-
  disabled (Web Speech needs network); the typed path is no longer offline-blocked.
- i18n: `capture.queued` (« Hors ligne — c'est gardé. Ça sera classé à la reconnexion. »).
  Update OFFLINE.md (capture moves to the queued list).
- **Tests:** rewrite `e2e/capture-offline.spec.ts` (queued confirmation, input cleared,
  pending count 1, no wire request; reconnect → replayed POST carries `Idempotency-Key`).

### A-3 — Depuis ce matin  [M · ~1–1.5 day · endpoint independent, greeting wrap trivial]
Pull-only "what changed today" peek off the board greeting.
- **New** `functions/api/today-changes.ts` — `authed()` GET (default scope; kiosk parent
  may open); 6 small `WHERE household_id=? AND created_at >= <localDayStart>` selects over
  `list_items.added_by`, `meals.suggested_by`, `notes.member_id`/`author_label`,
  `day_notes.member_id`, `drawings.member_id`, and `events` (face-less — decided). Exclude
  `mots` (addressed/scheduled) and chore/todo/pantry churn. Cap ~20, newest first. Guest
  actor → `{ entries: [] }`. `worker/routes.ts` TABLE row.
- **New** `src/lib/sinceMorning.ts` (pure row→`{face,text,at}` composer; Maisonnée/null →
  « Quelqu'un ») + `sinceMorning.test.ts`.
- **New** `src/components/board/TodayChangesSheet.tsx` — reuse `Sheet` (not
  EntityDetailSheet — this lists many rows), `Avatar`, the `.ledger` row family,
  `EmptyState`. Query `['today-changes', todayLocalDay()]` with `gcTime:0` + fetch-on-open
  → **zero cache, zero unread state** when closed (the ⚠ calm guarantee).
- `src/pages/Board.tsx`: wrap the HubHead greeting title in a `<button>` (parent + `!isGuest()`);
  render the sheet. i18n `sinceMorning.*`. whatsNew `since-morning` + one guide point.
- **Tests:** vitest `sinceMorning.test.ts` (per-source sentences, Maisonnée fallback,
  `author_label` postbox name, sort/cap); e2e `sheets.spec.ts` (open → rows → close leaves
  no residue) + overflow sweep.

### C-13 — Un seul moteur ambiant  [M · Board selector rides C-12]
Fold the three "house at rest" surfaces onto one provider (cast already renders
`AmbientScreen`; the real dupes are 3 clock tickers, 2 next-up selectors, breath/drift math).
- **New** `src/lib/ambientScene.ts` — pure `pickNextEventToday(events, nowSec, opts)` with
  presets `SAVER_NEXTUP {includeAllDay:true, graceSec:0}` / `BOARD_NEXTUP
  {includeAllDay:false, graceSec:1800}` (**keep both** — decided), `breathAt(nowMs)`,
  `burnInDrift(nowMs)`; + `useAmbientScene(active)` hook (10 s tick gated on `active`,
  re-seed on activation, `enabled: active && showNext`, **no** `live`). + `ambientScene.test.ts`
  (exact-value burn-in/breath cases lock E-37/F-47; grace boundaries).
- `src/components/AmbientScreen.tsx` → consume the hook (covers screensaver AND cast,
  byte-identical render). `src/pages/Board.tsx` → replace inline `nextUpToday` with
  `pickNextEventToday(todayEvents, nowSecBoard, BOARD_NEXTUP)` (if C-12 landed, the
  view-model calls it; `dayClear` never migrates here). `lib/ambient.ts` stays the pure
  settings store.
- **Risks:** never lift the ticker into a context above HubLayout/Board (kiosk perf); keep
  `enabled` gating + no `live` (free-tier). **Tests:** vitest units; e2e add
  `/cast?scene=ambient` to `scenes.spec.ts` + `.ambient__next` assertion in `idle-ambient.spec.ts`.

### D-17 — La rentrée  [M · ~2 days · migration + card independent, Demain line rides C-12]
School-year bounds typed once → board knows a school morning; year view shows bounds.
Rush-hour diet (08-C-25) **parked — not built here.**
- Migration `household_preferences` (see Migrations) + `functions/_lib/householdPrefs.ts`.
- `functions/api/household.ts`: `schoolYear` (`{firstDay,lastDay,breaks:[{from,to,label?}]}`)
  in GET + PATCH branch (validate dates parse, ordered; null clears). Rides `/api/household`
  (kiosk-readable), no new endpoint.
- `src/lib/year.ts` (the D-16 module): `SchoolYear` type + `schoolDayKind(daySec, sy,
  holidaysOn): 'school'|'conge'|null` — **null on weekends and outside the interesting
  edges** (decided: silent except rentrée/dernier jour/relâche/in-term fériés, so summer
  isn't wallpaper); `yearPoints()` gains a `'ecole'` `YearPointKind`.
- `src/components/operator/agenda.tsx`: **new** `SchoolYearSection` appended in the existing
  Agenda sub (C-15 rule: no new pill), `useWrite` PATCH `household`.
- `src/pages/Board.tsx` (+ SimpleBoard via C-12): the « Demain » qualifier line (🎒/🏖️),
  computed once in the view-model, three lenses render it (toddler as `Sayable`).
- `YearView.tsx`: `'ecole'` dot + legend. i18n `operator.schoolYear*` + `board.tomorrowSchool`
  /`tomorrowConge` + `boardView.legendEcole`. operatorHelp `schoolYear`, guide point,
  whatsNew `rentree`.
- **Tests:** vitest `year.test.ts` (`schoolDayKind`: weekends, in-term férié, relâche edges,
  before/after bounds, unset→null, edge-only speaking, DST); e2e settings + a `household`
  stub asserting the Demain line.

> **D-21 « Sortir le bac »** (garde, [S]) — **revised approach per Marc:** do **not** add a
> bins pref/table. Ride the **existing Corvées recurrence engine** (`home_projects`/chores
> already do biweekly & every-N via `RecurPicker`/the recur engine). Add a per-chore flag
> (e.g. `announce_evening`) so a chosen recurring chore ALSO emits an evening-before board
> announce line (the fête-line sibling — extend `EventRow` with a generic `announce?:{tag}`,
> not `holiday:true`, so it reads « Ce soir » not « Fête »), toddler-hearable, per-device
> opt-out (`babillard-bac` store). Sits on the C-12 announce-merge seam → build in Wave 3/4
> after C-12. Migration: a single nullable flag column on the chore table (or reuse an
> existing lead/flag field — confirm at build). i18n `board.binTonight`, display toggle.
> *(This item was mid-planned under the old "bins pref" shape; re-scope before building.)*

---

## Wave 4

### C-14 — Un seul tiroir d'idées-repas  [M · ~2 sessions · after C-15]
One `IdeasDrawer` (Modal bottom sheet) with source chips; retire the scattered pools.
- **New** `src/components/kitchen/IdeasDrawer.tsx` — a `Rail` of chips (**Idées** default ·
  ⭐ Favoris · 🧊 À écouler · 🤖 IA · 👧 Proposé par), one active at a time; body reuses
  `MealPool` (add `hideHeading?`). Chips map to: kept pool (`MEAL_IDEAS_KEY`), `useLoves()`
  recipes (loving faces, never counts), `Leftovers` config + `rankUseSoon` shortlist, the
  `useMealSuggest` AI batch as rows, `suggested_by != null` rows. Vide-frigo stays its own
  identity as a footer button → opens the untouched `EmptyFridgeSheet`. **Never a
  week-planner** (A-1 rejected): planning is the existing one-row `MealPlanPicker`.
- **Restants:** keep a slim one-line hint beside the grid opener (decided) + full list in
  the 🧊 chip.
- **Kid-suggestion visible:** migration `meal_ideas.date`; `meal-ideas` GET/POST carry
  `date`; `useMealPlanning.kidSuggest` sends `{title, recipeId, suggestedBy, date}` (drop
  the "(Mardi)" title hack). Empty day tile with a matching `suggested_by` idea → a small
  Avatar + « Léa propose 🍕 » chip; **tap opens the drawer on 👧** (decided, no auto-plan).
- **Retire:** `MealIdeas.tsx`, `Leftovers.tsx`, the inline `SUGGEST_DRESS`/suggestion-card
  band in `Kitchen.tsx`, `kitchenActions` `ai`/`book`/`useup`/`emptyFridge` (＋ kitchen
  tiles shrink 5→2: Shop + Idées), their `ADD_HELP`/`kitchenTabHelp` keys (use
  `helpFromGuide` from C-15), the `.kitchen__suggestion*` CSS.
- i18n `kitchen.ideas*` + `kidProposes(name)`; guide rewrite (append points at END —
  indices load-bearing); whatsNew `ideas-drawer`; register `IdeasDrawer` in DevKit +
  COMPONENTS.md; mark `MealIdeas`/`Leftovers` removed.
- **Tests:** `helpRegistry.test.ts` (re-keying); `calm-tenets` stays green; a pure
  `ideasForDay(ideas, date)` unit; rewire ideas/leftovers/suggest selectors in
  `interactions`/`states`/`coverage`/`meals`/`kitchen-meal-plan` specs; overflow sweep opens
  the drawer; one kid-suggest→parent-sees-chip scenario.

### D-18 — Le pont, version minimale (+ E-38 locale)  [M · ~2 days · before D-19]
Named, standing, revocable guests; reçu-✓; per-guest locale.
- Migration `guests + standing/label/lang` (see Migrations).
- **Token semantics (security keystone):** keep stateless HMAC but a standing token
  (`s:1`, `x`=10-yr backstop) is **DB-required** — `resolveActor` (`_lib/household.ts`)
  accepts a standing token only when the `guests` row exists AND `revoked_at IS NULL`
  (legacy short tokens keep row-optional behaviour). `guest/start.ts` standing mint = a
  **mandatory** row INSERT (500 on failure — never hand out an unkillable token). Factor the
  acceptance predicate into a pure `guestRowAcceptable(standing, row)` for unit tests.
- **Any kind can be durable** (decided) — the mint UI adds a « Durable — jusqu'à
  révocation » TTL option for every kind + a required name (« Pour qui ? ») + a prominent
  **how-to-revoke hint** and `useConfirm` on standing revoke. Flood cap standing-aware
  (`guestRate.ts`: 400 vs 40).
- **E-38 locale:** `lang` on the row + appended to the minted URL (`&lang=`); `main.tsx`'s
  existing `?guest=` boot block reads it synchronously into `localStorage 'babillard-lang'`
  (no flash, no server change).
- **Reçu-✓ (postbox only, decided):** `postbox.ts` accept already sets
  `status='accepted'`+`reviewed_at`; `guest/window.ts` postbox branch (guest actor only)
  returns `lastAcceptedAt` + first ~40 chars → `Postbox.tsx` shows one quiet success line
  on the next visit (rides the existing fetch, no new poll). Add the missing `isError →
  <GuestExpired/>` so a revoked durable link reads correctly.
- No new endpoints/routes (rides `guest/start`, `guest-links`, `guest/window`). i18n
  `guest.ttlStanding`/`standingName*`/`noExpiry`/`revokeStandingConfirm`/`guestLang*` +
  `postbox.receivedAck`; fix the stale `guest.limitation` copy. whatsNew `le-pont`, guide
  `share-access`.
- **Tests:** extend `guestToken`/`auth`/`shareModes` vitest (standing round-trip, backstop,
  device token never cross-verifies), pure `guestRowAcceptable` test; e2e `share-links`
  (durable option, name required, « N'expire pas » chip, confirm-revoke) + `postbox`
  (reçu-✓, 403→GuestExpired). **Reviewers verify `household.ts` first.**

### D-19 — La carte de la gardienne se complète  [S · ~1 day · after D-18]
- **New** pure `src/lib/handoffGaps.ts` (+ test): from the operator-preview payload
  (`guest/window?kind=sitter`, already exists) compute missing `emergency`/`toKnow`/
  `bedtimeRoutines`/`wifi.ssid`/`pins`.
- `operator/guest.tsx`: on `kind==='sitter'`, a quiet « Il manque : … — Compléter » block
  with per-gap deep links (`/cercle`, `/settings?tab=cercle&sub=members`, `/routines`,
  in-page `ShareInfoEditor`, `/cercle?section=carnets`); never blocks minting. Plus an
  opt-in « Joindre un parent » checkbox + member picker (reuse the signed `target_key` slot
  as intake does — `targetKey:'member:<id>'`, validated in-household; default OFF).
- `guest/window.ts` sitter branch → `reachParent:{name,phone}|null`; `HandoffPage.tsx`
  renders it atop the Urgence section. No migration (`target_key` exists since 0098).
- i18n `guest.sitterMissing*`/`missing*`/`reachParent*`. whatsNew `carte-gardienne`.
- **Tests:** `handoffGaps.test.ts`; e2e `share-links` (gaps block with deep links; absent
  when complete) + `guest-scenes` (reachParent tel line on /handoff).

### E-22 — Demande à la maison  [M · ~1–1.5 day]
Voice Q&A over the household's own data (the typed `/api/ask` already exists in Search).
- **Server (extend `functions/api/ask.ts`):** extract snapshot→prompt-lines into pure
  `functions/_lib/askContext.ts` (+ tests). Add retrieval: recurring events
  (`expandRange` from `_lib/recur.ts` — closes the handler's own documented gap), birthdays
  (`fetchBirthdayPeople`+`birthdayOccurrences`), **and cercle contacts + carnet next-dues**
  (decided v1 broadening — « c'est quoi le numéro du vétérinaire ? », « quand est le
  prochain entretien ? »). One bounded snapshot + one inference, never a poll.
- **Client:** **new** `src/components/AskSheet.tsx` (Modal) — big `VoiceButton`
  (tap-to-talk; `useVoiceInput` single-shot; unmount kills the mic → "under a finger only")
  + a typed `EditField` fallback + the answer card. **Auto-speak** the answer once via
  `useSpeak()` + a 🔊 replay (decided). Extract `ASK_LOOK`/`relatedFor` from
  `SearchPage.tsx` into shared `src/lib/askAnswer.tsx` (both render the identical card).
  Mic button in `HubHead.tsx` beside the loupe, `useAi().enabled && !isGuest()` (AI-unset →
  mic hides, loupe remains = "degrades to the search box"). Toddler/guest: hidden.
- **Degrade paths:** AI off → open search; no STT → typed field; model fail → `X-AI-Error`
  toast + « chercher … partout » link; unknown → honest « je ne sais pas » + search;
  offline → VoiceButton already disabled.
- i18n `ask.*`; guide card `ask` + FeatureMap tile; whatsNew (card `ask`); register
  AskSheet in DevKit + COMPONENTS.md.
- **Tests:** vitest `askContext` (formatting, recur expansion, birthdays, contacts/carnets,
  caps, FR/EN); e2e `ask-sheet.spec.ts` mocking `/api/health`+`/api/ask` on the **typed**
  path (Playwright has no mic) + overflow sweep.

---

## Registration checklist (every user-facing item)
Per the bmad/10 guardrail "pruning may not orphan the map": each shipped item updates, in
the SAME commit — `COMPONENTS.md` (new/removed shared components), `src/pages/DevKit.tsx`
(new primitives), `src/lib/guideContent.ts` (user-facing behaviour), `src/lib/whatsNew.ts`
(one top entry), and the item's checkbox in `10-la-maison-qui-dure.md`. i18n changes keep
FR+EN parity (the `typeof FR` contract). New sheets/rows extend the phone-width overflow
e2e sweep.
