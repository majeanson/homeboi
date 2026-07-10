# PARITY.md — the feature-parity audit & uniformization playbook

> **What this is.** A standing, multi-day-executable playbook that maps every
> user-facing feature of Babillard against every cross-cutting capability
> dimension (UI/UX reach + DB/API reach), names the "most complete" features as
> the gold standard, then drives fix-waves to bring the others up to par —
> ending with primitives extracted from proven gaps and a canonical
> **new-entity checklist** for future features.
>
> **Successor to `UNIFORMIZING.md`** (2026-06-26, fully executed). Same format
> (checkboxes, severity, verdicts), different altitude: UNIFORMIZING deduped
> *mechanisms*; PARITY audits *features* for even coverage of those mechanisms.
>
> ⚠️ **The code is the truth.** UNIFORMIZING's hardest lesson: findings go stale
> between sessions. Every score in Part 3 and every wave item in Part 4 must be
> **re-verified in code before building**. This file records verdicts, not facts.
>
> **Legend** (used everywhere below):
> - ✅ present and wired through the shared mechanism
> - ➖ **deliberately absent** — a first-class score, always with a one-line why
>   (precedent: recipes/routines have *no* detail peek on purpose — tapping
>   navigates to their full page). Parity means *considered everywhere*, not
>   *present everywhere*.
> - ❌ gap — absent with no recorded verdict
> - 🔶 partial / hand-rolled beside the shared mechanism (worst state: works, but
>   invisible to the next session and drifts)
> - ❓ not yet audited
>
> **Calm tenets override every dimension.** No score ever justifies adding
> counts, ranks, streaks, points, push, or inventory quantities
> (`calm-tenets.test.ts` enforces the structural ones).

---

## How to run this playbook (execution schedule)

Each "day" is one session. Sessions are resumable — a half-filled column is fine;
mark unfinished cells ❓, never guess.

- [ ] **Day 1 — Audit A1 (mechanical, greppable):** columns **D1 CRUD, D4 offline,
      D5 realtime, D13 schema hygiene, D14 media** for all rows. Pure grep +
      migration reading; no page-level judgment needed.
- [ ] **Day 2 — Audit A2 (mechanical):** columns **D6 search, D11 empty states,
      D12 attribution, D16 e2e**. Finish any A1 leftovers.
- [ ] **Day 3 — Audit B (per-page reading):** columns **D2 peek, D3 undo/confirm,
      D7 guide/help/tour, D8 toddler lens, D9 kiosk/mobile, D10 voice, D15 i18n
      register**. These need opening the pages, not just grepping.
- [ ] **Day 4 — Rank & choose:** fill Part 3's gold-standard section + the ranked
      gap list; write the Part 4 waves as sized checkbox lists.
- [ ] **Day 5+ — Fix-waves:** one wave per session (Part 4). After each wave,
      update the matrix cells it fixed and re-run the wave's verification.
- [ ] **Last day — Part 5:** extract primitives (≥3-features rule), finalize the
      new-entity checklist, fold it into `CLAUDE.md`, close this file with a
      status headline like UNIFORMIZING's.

**Session protocol:** (1) read this file top to bottom; (2) re-verify any cell you
build on; (3) work your day's checkboxes; (4) update cells + tick boxes + note
verdicts inline; (5) commit `PARITY.md` with whatever shipped (push to `main`).

---

## Part 1 — Feature roster (the rows)

~33 user-facing features. Anchors are the feature's *reach*: tables (migration
numbers), endpoints (`worker/routes.ts` names), pages/components, shared query
keys (`src/lib/queryKeys.ts`). A feature missing an anchor kind isn't a gap per
se (Recherche has no table) — the anchors just tell the auditor where to look.

### Board (Le babillard)

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F1 | Agenda & événements | events (0001+) | events, month, year, this-week, day-notes | Board, DayPlanPage, EventFormPage, MomentScene, board/MonthView, YearView | EVENTS, MONTH, BOARD |
| F2 | À faire (corvées) + Projets & entretien | tasks, task_participants, home_projects (0074) | chores, chores-ledger, home-projects | ChoreFormPage, HomeProjectFormPage, board cards, operator/chores | CHORES, HOME_PROJECTS |
| F3 | À compléter (todos) | todos, todo_templates (0046/0047) | todos, todo-templates | todos/*, TodoSection | TODOS, TODO_TEMPLATES |
| F4 | Notes frigo (texte/audio/dessin/photo) | notes (0018, media trio 0043/0055) | notes, note-media | board/Notes, MemoControls, DrawPad | BOARD |
| F5 | Mots (« Laisse un mot ») | mots (0094/0095) | mots | MotsCard, mots/* | MOTS |
| F6 | Mes habitudes | habits, habit_days (0112) | habits | HabitudesPage, HabitFormPage, habits/*, HabitudesCard | HABITS |
| F7 | Photos / cadre | photos (0006) | photos | operator/photos, AmbientScreen | PHOTOS |
| F8 | Dessins (galerie) | drawings (0056) | drawings | DrawingGalleryPage, DrawPad | DRAWINGS |
| F9 | Capture (＋ / AddSheet / partage PWA) | captures | capture, ask, transcribe, a-regler | AddSheet, AskSheet, CaptureForm, QuickAddPage, /share | A_REGLER |
| F10 | Recherche | — (client-side over caches) | — | SearchPage, lib/searchIndex.ts | (reads all) |
| F11 | Le babillard (widget space lui-même) | household prefs (layout local) | board, today-changes, weather, wonder | Board, WidgetGrid, CardSlot, lib/boardCards, operator/boardLayout | BOARD, WEATHER |

### La cuisine

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F12 | Plan des repas | meals (0001+) | meals, meal-staples | kitchen/MealPool, DayEditor, operator/meals | (kitchen/types.ts keys) |
| F13 | Idées de repas | meal_ideas (0025/0108) | meal-ideas, suggest-meal | kitchen/MealIdeas, IdeasDrawer, IdeasPage | (kitchen keys) |
| F14 | Restants | meal_leftovers (0035) | meal-leftovers | kitchen/*, buildLeftover peek | (kitchen keys) |
| F15 | Recettes (livre, import, cook mode, ❤) | recipes (0008+), recipe_loves (0044) | recipes, recipe-* (draft/image/import/ocr/vision/tags/step-image/to-list), recipe-loves | RecipeBookPage, RecipeViewPage, RecipeFormPage, CookPage, MultiCookPage, HeartButton | LOVES + kitchen keys |
| F16 | Garde-manger (bas / à écouler / réserve) | pantry_low, pantry_use_soon (0010), pantry_reserve (0036) | pantry, use-soon, reserve | kitchen/PantryTab, ReserveSection, operator/reserve | (kitchen keys) |
| F17 | Vide-frigo & suggestions IA | — | empty-fridge, suggest-meal | kitchen ＋ tile, VideFrigo flow | — |
| F18 | Circulaires & aubaines | — (Flipp reconstruction) | deals, flyer, flyers, flyer-img, place-import | CirculairesPage, PriceMatchPage | FLYERS |

### La liste

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F19 | La liste (+ allées, caisse) | list_items (0001+, 0078 position, 0110) | list, recipe-to-list | Liste, ListEditPage, CashierPage, PriceMatchPage, lib/picks | (liste keys) |
| F20 | Fantômes & déjà acheté | ghost_items, purchase_log (0005+) | ghost | operator/shopping, ghost strip | GHOSTS, HISTORY |

### Le cercle

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F21 | Personnes & familles | contacts (0049+), contact_links (0049/0050), contact_photos (0054) | cercle, cercle-links, cercle-photos | Cercle, CercleFormPage, CercleFamilyPage, FamilyBuilder, FamilyImportPage | CERCLE |
| F22 | Groupes | contact_groups (+members) (0052) | cercle-groups | GroupForm, Social view | CERCLE |
| F23 | Animaux | pets (0071) | pets | CerclePetPage, PetForm | CERCLE |
| F24 | Business | businesses (0063/0065) | businesses | cercle/BusinessesTab, BusinessForm | BUSINESSES |
| F25 | Notes du cercle | family_notes (0062/0093/0111) | family-notes | cercle/CercleNotes, NoteEditor, NotesList | FAMILY_NOTES |
| F26 | Carnets (+ care-log, home-pins) | carnets, care_log, home_pins (0082) | carnets, care-log, home-pins | CercleCarnetPage, CarnetForm, CarnetDocs | CARNETS, CARE_LOG, HOME_PINS |
| F27 | Notre monde | — (derived) | — | CercleWorldPage, lib/cercle layouts | CERCLE |

### Routines

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F28 | Routines & player | routines, routine_runs (0001+, timers 0079) | routines, routine-audio, routine-card-photo, routine-selfie | Routines, RoutineFormPage, RoutineRunPage, RoutinePlayer | ROUTINES |
| F29 | Mur de collants | routine_stickers (0105) | routine-stickers | StickerWallPage | STICKERS |
| F30 | Jouer | — | — | JouerPage, jouer/* | — |

### Transversal

| # | Feature | Tables | Endpoints | Pages / components | Query keys |
|---|---|---|---|---|---|
| F31 | Voyage (privé + partagé) | trips + trip_notes/packing (0092), shared_trips + 3 (0101) | trips, trip-*, shared-trip-* (11) | VoyagePage, SharedVoyagePage, DeparturePage, voyage/* | TRIPS*, SHARED_TRIP* |
| F32 | L'auto | schedule_blocks (0069), car_day (0070), household cars | car, car-day, schedule | VoiturePage, AutoCard, operator/schedule | CAR, SCHEDULE |
| F33 | Partager & invités (guest links, intake, postbox, partage public, demo) | guests (0098+), intake_* (0075/0076), postbox_* (0085), shares (0102), family_shares (0100) | guest*, intake, postbox, share, share-public, family-share, demo | ShareModal, IntakeForm, Postbox, PartagePage, FamilyWindowPage, operator/guest + reviews | SHARES, guestWindowKey |
| F34 | Réglages, appareils & veille | devices, pairing_codes, household(+preferences 0106) | pair/*, members, household, takeout, health, ai-* | Operator, Pair, Setup, operator/* (~28 sections), lib/ambient | DEVICES, MEMBERS, HOUSEHOLD, HEALTH |

> Roster rule: if a future audit day finds a surface not covered by a row (a new
> feature shipped since), **add a row first**, then score it.

---

## Part 2 — Dimension columns & scoring recipes

For each dimension: what ✅/➖/❌ means and the exact way to score a row. All
source files verified to exist as of 2026-07-10.

**D1 — CRUD completeness.** Can the user create / edit / delete / reorder the
entity everywhere they meet it, where sensible? Score from the feature's
endpoints + `RowActions` / form pages. ➖ examples: purchase_log is append-only
by design; routine_runs empty themselves nightly. Recipe: read the handler for
supported methods, grep the pages for `RowActions`, edit routes, `usePointerDnd`.

**D2 — Detail peek.** Tapping the item where it appears as a *row/mention* opens
`useEntityDetail` with a real adapter. Source: `src/components/detail/adapters.ts`
(10 builders) + `DetailKind` in `src/lib/detail.ts`. ➖ verdicts already recorded
in code: recipe, routine (navigate to their scene instead — "tap the thing, get
the thing"), notes & carnet scene (media-first, too rich for a peek). Recipe:
grep `adapters.ts` for the entity; if absent, decide ➖ (write the why) or ❌.

**D3 — Undo vs confirm, correctly assigned.** Light delete → undo toast via
`useDeferredRemoval` (mandatory for live-polled lists — flash-back glitch);
heavy/cascading delete → `useConfirm`. Score 🔶 if a *light* delete uses a heavy
confirm (friction) or a delete has neither. Recipe: grep the feature's components
for `useDeferredRemoval(` / `confirm(` and judge weight per site.

**D4 — Offline writes.** User-content writes go through `useWrite()`
(`src/lib/write.ts`), not raw `api({method})`. Exemptions (LIB-1 verdict, keep):
auth, telemetry, device/household toggles, R2 two-step uploads, AI round-trips,
operator online-review flows. Recipe:
`grep -n "method:" src/<feature files>` and classify each hit.
Known to re-verify: `DayPlanPage.tsx` (~15 raw writes), `Board.tsx` (~11),
`FamilyImportPage.tsx` (~9) — never individually itemized by LIB-1.

**D5 — Realtime keys.** The feature's write paths appear in `PATH_KEYS`
(`functions/_lib/realtime.ts`) with the *right* keys, or intentionally in
`SILENT_PATHS`. Unmapped writes fall through to `[['board']]` (safe but
over-broad → 🔶). Recipe: read `PATH_KEYS`/`SILENT_PATHS` for the feature's
endpoint names; check keys match `queryKeys.ts`.

**D6 — Search.** The entity has a `SEARCH_INDEX` entry (`src/lib/searchIndex.ts`;
"searchable = has an entry"). ➖ for ephemeral/derived things (weather, runs).
Recipe: grep the kind in `SEARCH_INDEX`. *(Dry-run finding: `habit` is absent —
F6 is unfindable from Recherche. Pre-scored ❌.)*

**D7 — Guide card + « ? » help + tour.** Three sub-scores: (a) a guide card in
`src/lib/guideContent.ts` (32-card ceiling — **merge into an existing card
first**, per `DISCOVERY.md`); (b) coverage by one of the 7 help registries
(`addHelp/boardHelp/cercleHelp/kitchenTabHelp/listeHelp/operatorHelp/routinesHelp.ts`);
(c) a tour step (`lib/tourContent.ts`, 6 tours). Guards:
`helpRegistry.test.ts`, `guideLinks.test.ts`. Known candidates from exploration:
Voyage, Mots, Carnets, Habitudes, L'auto, Dessins have thin/no help-mode
coverage — verify per row. Read `DISCOVERY.md` before fixing anything here.

**D8 — Toddler/Simple lens.** The page renders something *deliberate* under
`useAudience()` = toddler (picture-first) and simple (parent views, calmer),
or ➖ (operator/settings is locked away by design). Recipe: grep the page for
`useAudience` and open it; "no branch at all" on a themed tab = ❌.

**D9 — Kiosk vs mobile fit.** Glanceable on the wall tablet (board card if it
deserves one — `lib/boardCards`), workable on a phone (no horizontal overflow;
rows via `Cluster`/`Rail`). Recipe: grep `useSurface`, check `boardCards.ts` for
a card, sweep the page at 360px (e2e `layout-overflow` pattern).

**D10 — Voice input.** Compose/capture surfaces get voice via `EditField`'s
opt-in or `VoiceButton`. ➖ for structured forms (dates, pickers). Recipe: grep
the feature's composer for `voice` / `VoiceButton`.

**D11 — Empty states.** Every list/card surface renders `EmptyState` (or reports
via `useReportEmpty` if it's a board card — never a bare `return null`). Recipe:
grep the feature's components for `EmptyState|useReportEmpty`; open the surface
with no data (sample seed off).

**D12 — Attribution & faces.** "Who" is captured with the right pattern (DB-5:
soft member ref / `author_member_id` / external `author_label`) and *shown*
(Avatar tint, never counts/ranks — chore-ledger rule). Recipe: check the table's
`*_by` columns + whether the UI surfaces the face.

**D13 — Schema hygiene.** `colour` not `color`, `position` not `sort_order`,
`deleted_at` for soft delete, JSON columns `NOT NULL` with defaults, soft refs
commented. Forward-rule only — don't churn working tables; score 🔶 with a
"converge opportunistically" note. Known outliers (from migrations sweep):
`color` on tasks/home_projects/schedule_blocks/carnets; `carnets.archived_at`
is a **sanctioned** exception (➖).

**D14 — Media pattern.** Attachments use the `media_kind` + `media_key`
(+ `scene_key`) trio and `uploadMedia()`, old blobs freed on replace/clear, R2
unset → controls hide. Known 🔶 (DB-1 deferred, opportunistic): recipes
`image` + parallel step-image arrays; routines parallel card-audio/photo arrays.

**D15 — i18n register.** FR/EN key *parity* is tsc-enforced (`typeof FR`) — this
column only audits **register**: Québécois FR (souper, céduler, courriel), no
France-French drift, toddler-facing strings speakable by TTS. Recipe: read the
feature's `i18n.ts` block aloud.

**D16 — e2e coverage.** At least one spec exercises the feature's happy path
(~71 specs in `e2e/`). Known gaps from exploration (verify): L'auto/VoiturePage,
mur de collants, price-match, deals/circulaires browsing, family-import.
Recipe: grep `e2e/` for the feature name; check the visual sweep specs too.

---

## Part 3 — The matrix (filled on audit days)

> Fill cells with ✅ / ➖ / ❌ / 🔶 / ❓. A ➖ or 🔶 cell must have a footnote.
> Pre-filled cells below come from the 2026-07-10 exploration + dry-runs and are
> **already verified**; everything else starts ❓.

| Feature | D1 CRUD | D2 Peek | D3 Undo | D4 Offline | D5 RT | D6 Search | D7 Guide | D8 Toddler | D9 Kiosk/Mob | D10 Voice | D11 Empty | D12 Who | D13 Schema | D14 Media | D15 i18n | D16 e2e |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 Agenda | ❓ | ✅ | ❓ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ➖¹ | ❓ | ❓ |
| F2 Corvées+Projets | ❓ | ✅ | ❓ | ❓ | ✅ | 🔶² | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | 🔶³ | ➖¹ | ❓ | ❓ |
| F3 Todos | ❓ | ✅ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ➖¹ | ❓ | ❓ |
| F4 Notes frigo | ❓ | ➖⁴ | ❓ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ✅ | ❓ | ✅ | ❓ | ✅ | ❓ | ❓ |
| F5 Mots | ❓ | ✅ | ✅ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ✅ | ✅ | ✅ | ❓ | ✅ |
| F6 Habitudes | ❓ | ❌ | ❓ | ❓ | ✅ | ❌⁵ | 🔶⁶ | ❓ | ✅ | ❓ | ✅ | ✅ | ✅ | ➖¹ | ❓ | ✅ |
| F7 Photos | ❓ | ➖ | ❓ | ➖⁷ | ➖⁷ | ➖ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ | ✅ | ✅ | ❓ | ❓ |
| F8 Dessins | ❓ | ➖⁴ | ❓ | ➖⁷ | ✅ | ❓ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ | ❓ | ✅ | ❓ | ✅ |
| F9 Capture | ❓ | ➖ | ➖ | 🔶⁸ | ✅ | ➖ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ➖ | ❓ | ❓ | ✅ |
| F10 Recherche | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ➖ | ➖ | ➖ | ❓ | ✅ |
| F11 Widget space | ✅ | ➖ | ❓ | ➖⁹ | ➖ | ➖ | ✅ | ❓ | ✅ | ➖ | ✅ | ➖ | ➖ | ➖ | ❓ | ✅ |
| F12 Plan repas | ❓ | ✅ | ✅ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ➖ | ❓ | ✅ |
| F13 Idées repas | ❓ | ❓ | ✅ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ➖ | ❓ | ❓ |
| F14 Restants | ❓ | ✅ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ |
| F15 Recettes | ❓ | ➖⁴ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | 🔶¹⁰ | ❓ | ✅ |
| F16 Garde-manger | ❓ | ❓ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ |
| F17 Vide-frigo | ➖ | ➖ | ➖ | ➖⁸ | ➖ | ➖ | ❓ | ❓ | ❓ | ❓ | ❓ | ➖ | ➖ | ➖ | ❓ | ❓ |
| F18 Circulaires | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ➖ | ➖ | ❓ | ❌ |
| F19 La liste | ✅ | ❓ | ✅ | ✅ | ✅ | ❓ | ❓ | ❓ | ❓ | ✅ | ✅ | ✅ | ✅ | ➖ | ❓ | ✅ |
| F20 Fantômes | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ |
| F21 Personnes | ✅ | ✅ | ❓ | ❓ | ✅ | ✅ | ✅ | ❓ | ❓ | ❓ | ✅ | ➖ | ❓ | ✅ | ❓ | ✅ |
| F22 Groupes | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ✅ | ➖ | ❓ | ❓ |
| F23 Animaux | ❓ | ✅ | ❓ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ✅ | ✅ | ❓ | ❓ |
| F24 Business | ❓ | ✅ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ✅ | ✅ | ❓ | ❓ |
| F25 Notes cercle | ❓ | ➖⁴ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ✅ | ❓ | ✅ | ✅ | ✅ | ❓ | ❓ |
| F26 Carnets | ❓ | ➖⁴ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | 🔶³ | ❓ | ❓ | 🔶¹¹ |
| F27 Notre monde | ➖ | ❓ | ➖ | ➖ | ➖ | ➖ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ➖ | ➖ | ❓ | ❓ |
| F28 Routines | ❓ | ➖⁴ | ❓ | ❓ | ✅ | ✅ | ✅ | ✅ | ❓ | ❓ | ❓ | ✅ | ❓ | 🔶¹⁰ | ❓ | ✅ |
| F29 Collants | ❓ | ➖ | ❓ | ❓ | ✅ | ➖ | ❓ | ❓ | ❓ | ➖ | ❓ | ✅ | ❓ | ➖ | ❓ | ❌ |
| F30 Jouer | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ❓ | ✅ | ❓ | ❓ | ❓ | ➖ | ➖ | ➖ | ❓ | ❓ |
| F31 Voyage | ✅ | ❓ | ✅ | ❓ | ✅ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ✅ | ✅ | ✅ | ❓ | ✅ |
| F32 L'auto | ❓ | ❓ | ✅ | ❓ | ✅ | ✅ | ❓ | ❓ | ❓ | ➖ | ❓ | ❓ | 🔶³ | ➖ | ❓ | ❌ |
| F33 Partager & invités | ❓ | ➖ | ❓ | ➖¹² | 🔶 | ➖ | ❓ | ➖ | ❓ | ❓ | ❓ | ✅¹³ | ✅ | ✅ | ❓ | ✅ |
| F34 Réglages & appareils | ✅ | ➖ | ❓ | ➖¹² | ✅ | ➖ | ✅ | ➖¹⁴ | ❓ | ❓ | ❓ | ➖ | ❓ | ➖ | ❓ | ✅ |

Footnotes (verdicts recorded so far):
1. No media attachment by design — the entity is text/derived only.
2. Home projects searchable; loose chores ("À faire") — verify which kinds `SEARCH_INDEX` covers.
3. `color` column (pre-0087 outlier) — converge opportunistically during a schema-touching migration, never churn-only (UNIFORMIZING D.1).
4. Deliberate no-peek verdict recorded in `adapters.ts` L387-397 / UNIFORMIZING: tapping navigates to the full page/scene ("tap the thing, get the thing").
5. **Dry-run confirmed 2026-07-10**: no `habit` entry in `SEARCH_INDEX` — « Mes habitudes » invisible to Recherche. One-line fix (searchIndex.ts says so itself).
6. Guide card `habits` exists (guideContent.ts L1096) but no board-help entry for the card and no tour step — verify on Day 3.
7. Two-step R2 upload — exempt from useWrite/realtime per LIB-1 verdict.
8. AI round-trip (capture classify / vide-frigo) can't be queued offline — exempt, but the *fallback* manual path must work offline; verify.
9. Board layout is device-local localStorage (`lib/boardCards`), not a server write.
10. DB-1 deferred: parallel media arrays (recipe step-images, routine card-audio/photos) instead of the trio — opportunistic convergence only.
11. Carnet restore/scene covered; care-log flows beyond restore unspecced.
12. Auth/pairing/guest flows are online-only by nature.
13. Postbox exact-name-match tinting is THE template for guest→household attribution (P2-8).
14. Settings locked away from toddler by design (kid one-way door).

### Gold standard (fill on Day 4)

- **Overall most-complete features:** ❓ (exploration suggests **La liste (F19)**,
  **Recettes (F15)**, **Mots (F5)**, **Voyage (F31)** as candidates — confirm
  from the completed matrix, then write *why* each is the reference.)
- **Per-dimension reference implementation** (the file a fixer should copy from):
  - D2 peek: `buildBusiness`/`buildPet` (clean, recent) — ❓ confirm
  - D3 undo: Liste / MealPool via `useDeferredRemoval` — ❓ confirm
  - D7 discovery: Le cercle (help registry + tour + guide cards + FAB) — ❓ confirm
  - … one line per dimension.

### Ranked gap list (fill on Day 4)

> 🔴 user-visible gap · 🟡 hygiene/drift · 🟢 nice-to-have. Every entry cites its
> matrix cell. Seed entries from dry-runs:

- [ ] 🔴 F6×D6 — habits missing from `SEARCH_INDEX` (footnote 5).
- [ ] 🔴 F32×D16 / F29×D16 / F18×D16 — no e2e spec for L'auto, mur de collants, circulaires/price-match (verify, then spec the happy paths).
- [ ] 🟡 F6×D7 — habits guide card has no help/tour backlink (footnote 6).
- [ ] ❓ … (Day 4 fills the rest, ranked.)

---

## Part 4 — Fix-waves (write on Day 4, execute Day 5+)

One wave = one dimension across all its gapped features, sized to one session.
Standing rules for every wave: **reuse the existing primitive** (extend, don't
fork); a new Réglages setting merges into an existing sub (C-15); mobile +
toddler friendly; rows via `Cluster`/`Rail`; push straight to `main`; update the
matrix cell + tick the box when done.

- [ ] **Wave S — Search:** add missing `SEARCH_INDEX` entries (habits + whatever
      Day 2 finds). Verify: SearchPage finds one of each kind.
- [ ] **Wave H — Help/tour/guide:** cover the discovery-thin features (candidates:
      Voyage, Mots, Carnets, Habitudes, L'auto, Dessins). **Read `DISCOVERY.md`
      first**; merge into existing cards (32 is a ceiling); run
      `helpRegistry.test.ts` + `guideLinks.test.ts`.
- [ ] **Wave U — Undo/confirm rebalance:** demote light deletes wrongly behind
      `useConfirm` to the undo toast; add `useDeferredRemoval` where polled lists
      delete raw. Verify: delete → undo within 5 s on each touched surface.
- [ ] **Wave O — Offline writes:** triage the un-itemized raw `api()` writes
      (DayPlanPage, Board, FamilyImportPage + Day 1 finds); convert user-content
      ones to `useWrite`, record ➖ verdicts for the rest. Verify: airplane-mode
      write → reload → replayed (e2e offline-outbox pattern).
- [ ] **Wave P — Peek verdicts:** for every D2 ❌, either add an adapter
      (copy the reference builder) or record ➖ in `adapters.ts`'s verdict comment.
- [ ] **Wave T — Toddler/kiosk sweep:** every themed-tab feature gets a deliberate
      toddler treatment or a written ➖; 360px overflow sweep on touched pages.
- [ ] **Wave E — e2e:** specs for the uncovered features (happy path only; extend
      the visual sweeps rather than new harnesses where possible).
- [ ] **Wave D — Schema/media convergence (opportunistic only):** when a wave
      above already touches a table, fold in the `color`→`colour` /
      parallel-array→trio convergence (DB-1/D.1 rules). Never a churn-only wave.

---

## Part 5 — Primitive extraction & the new-entity checklist

### Extraction rule

Propose a new shared primitive **only when the completed matrix shows ≥3 features
hand-rolling the same shape** (the 🔶 cells are the hunting ground). For each:
name the 3+ call sites, extend-or-extract decision, and — if extracted —
register it in `/dev/kit` (`src/pages/DevKit.tsx`) + `COMPONENTS.md`, or it's
invisible to the next session.

Candidates to watch for while auditing (not yet justified — need the 3-site proof):
- [ ] ❓ a shared "entity list section" (header + rows + empty + add) — Board `Act`/`Section` vs kitchen pools vs cercle `NotesList` may already be 3 shapes of one thing.
- [ ] ❓ a `useEntityCrud(queryKey, endpoint)` bundle (useWrite + useDeferredRemoval + invalidate wiring) if Day 1 shows the same 15-line block in 3+ features.
- [ ] ❓ (add here as the matrix fills)

### The new-entity checklist (canonical — seeded now, finalized last day)

Every future entity/feature walks this list top to bottom; a skipped line is a
recorded ➖ with a why, never silence. When finalized, fold a pointer into
`CLAUDE.md` and keep the canonical copy here.

**Schema & backend**
- [ ] Migration follows the schema conventions: `created_at`/`updated_at`/`deleted_at`, `position`, `colour`, media trio, DB-5 attribution pattern chosen consciously, JSON `NOT NULL` defaults, soft refs commented. Calm test stays green.
- [ ] Handler under `functions/api/` wrapped in `authed()` (+ `'operator'` scope if destructive) **and** a `TABLE` row in `worker/routes.ts`.
- [ ] `PATH_KEYS` entry in `functions/_lib/realtime.ts` (or `SILENT_PATHS` with a why) + `realtime.test.ts` still green.
- [ ] Idempotent writes ride the existing middleware (nothing to do — verify only).

**Frontend data**
- [ ] Shared query key in `src/lib/queryKeys.ts` (page-local keys stay local).
- [ ] Writes via `useWrite()`; polled-list deletes via `useDeferredRemoval`; heavy deletes via `useConfirm`.
- [ ] Reads via `api()` only.

**UX reach**
- [ ] Detail adapter in `adapters.ts` — or a ➖ verdict comment beside the others.
- [ ] `SEARCH_INDEX` entry (or ➖ for ephemeral kinds).
- [ ] `EmptyState` / `useReportEmpty` on every surface (board card never returns bare null).
- [ ] Toddler + simple lens treatment (or written ➖); kiosk glanceability (board card decision in `lib/boardCards`); mobile 360px no-overflow (`Cluster`/`Rail`).
- [ ] Voice on compose surfaces via `EditField`'s opt-in (or ➖ for structured forms).
- [ ] Attribution shown as faces, never counts (calm).

**Discovery & i18n**
- [ ] Guide: merge into an existing card in `lib/guideContent.ts` (32-card ceiling) with Ouvrir/Régler/Essayer; « ? » help entries in the owning registry; tour step if it changes a main surface. Read `DISCOVERY.md`; orphan tests green.
- [ ] `i18n.ts` FR block in Québécois register (EN parity enforced by tsc).
- [ ] New Réglages setting stacks into an existing sub (C-15), never a new pill.

**Proof**
- [ ] One e2e happy-path spec (or extend a sweep spec).
- [ ] New shared primitive (if any) → DevKit + `COMPONENTS.md`.
- [ ] Add the feature as a row in this file's Part 1 and score it.

---

*Created 2026-07-10 from a two-agent exploration sweep (entities/endpoints/pages ×
capability dimensions) + dry-run scoring. Status: Parts 1–2 complete; matrix
pre-seeded; audit Day 1 not yet run.*
