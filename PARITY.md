# PARITY.md — the feature-parity audit & uniformization playbook

> ✅ **The counting trap is gone (2026-08-28).** Parts 5 and 6 are a **per-feature
> checklist template** — you copy them into a new feature's commit and tick them
> *there* — so they no longer carry checkboxes at all. They used to, and a naive count
> across the repo read them as ~33 pending tasks when the true number was zero; that
> mis-count opened at least one session. Plain bullets now: **copy, don't tick.**
>
> **This file holds exactly two open items**, both in Part 4's Wave D
> (opportunistic media-shape convergence). Everything else here is a verdict or a
> template. A `- [ ]` anywhere in this repo means real open work — see
> [`STATE.md`](./STATE.md) for the convention and for what genuinely holds work.
>
> ❓ marks an open **question** (a candidate primitive awaiting its 3-site proof),
> deliberately not a checkbox: it is not work until someone decides it is.

> **What this is.** A standing, multi-day-executable playbook that maps every
> user-facing feature of Babillard against every cross-cutting capability
> dimension (UI/UX reach + DB/API reach), names the "most complete" features as
> the gold standard, then drives fix-waves to bring the others up to par —
> ending with primitives extracted from proven gaps and a canonical
> **new-entity checklist** for future features.
>
> **Successor to `UNIFORMIZING.md`** (2026-06-26, fully executed; archived to `bmad/history/`). Same format
> (checkboxes, severity, verdicts), different altitude: UNIFORMIZING deduped
> _mechanisms_; PARITY audits _features_ for even coverage of those mechanisms.
>
> ⚠️ **The code is the truth.** UNIFORMIZING's hardest lesson: findings go stale
> between sessions. Every score in Part 3 and every wave item in Part 4 must be
> **re-verified in code before building**. This file records verdicts, not facts.
>
> **Legend** (used everywhere below):
>
> - ✅ present and wired through the shared mechanism
> - ➖ **deliberately absent** — a first-class score, always with a one-line why
>   (precedent: recipes/routines have _no_ detail peek on purpose — tapping
>   navigates to their full page). Parity means _considered everywhere_, not
>   _present everywhere_.
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

- [x] **Day 1 — Audit A1 (mechanical, greppable):** columns **D1 CRUD, D4 offline,
      D5 realtime, D13 schema hygiene, D14 media** for all rows. Pure grep +
      migration reading; no page-level judgment needed. **Done 2026-07-10** — all
      five columns filled/confirmed; footnotes 17–26 added; D5 was already fully
      seeded and is confirmed (one hygiene 🟢 gap surfaced).
- [x] **Day 2 — Audit A2 (mechanical):** columns **D6 search, D11 empty states,
      D12 attribution, D16 e2e**. **Done 2026-07-10** — all four filled for 34 rows;
      footnotes 27–42 added. D11 near-universal (88 files use `EmptyState`/`useReportEmpty`);
      D6 surfaced 5 new ❌ (Mots/meals/ideas/groups/Voyage) + confirmed Dessins searchable;
      D12 filled with 6 deliberate ➖ (photos/capture/leftovers/pantry/ghost/carnets carry
      no member-face by design); D16 **corrected two pre-seeds** (F18 ✅, F32 🔶) and flagged
      5 smoke-only surfaces.
- [x] **Day 3 — Audit B (per-page reading):** columns **D2 peek, D3 undo/confirm,
      D8 toddler lens, D9 kiosk/mobile, D10 voice, D15 i18n register** (D7 was Day 1).
      **Done 2026-07-10** — all six filled for 34 rows; footnotes 43–50. **The matrix is
      now complete (zero ❓).** D2/D10 are deliberate ➖ (peek = "tap the thing, get the
      thing"; voice routes through the ＋ capture spine); D15 all ✅ (register consistently
      Québécois, tsc-enforced parity); D3 clean but for **F29 sticker raw-delete (🔶)**; D8
      found **F5 Mots + F6 Habitudes have no toddler lens (❌)**; D9 all ✅ but for **F10/F18
      unswept scenes (🔶)**. D8/D9 read by two parallel Explore agents; the rest greppable.
- [x] **Day 4 — Rank & choose:** fill Part 3's gold-standard section + the ranked
      gap list; write the Part 4 waves as sized checkbox lists. **Done 2026-07-10** —
      gold standard = **F19 La liste** (overall ref) + F1 Agenda / F24 Business /
      F25 Notes cercle (all gap-free & rich), F15/F21 near-gold; **corrected the
      exploration's Mots/Voyage guesses** (both carry real ❌). Ranked gap list =
      **17 entries (4 🔴, 12 🟡, 1 🟢)**, each mapped to a wave. Part 4's eight waves
      now sized with per-item checkboxes + verify steps; suggested order S→T→H→E
      (🔴), then U→O (🟡), then P→D (opportunistic).
- **Day 5+ — Fix-waves:** one wave per session (Part 4). After each wave,
      update the matrix cells it fixed and re-run the wave's verification.
- **Last day — Part 5:** extract primitives (≥3-features rule), finalize the
      new-entity checklist, fold it into `CLAUDE.md`, close this file with a
      status headline like UNIFORMIZING's.

**Session protocol:** (1) read this file top to bottom; (2) re-verify any cell you
build on; (3) work your day's checkboxes; (4) update cells + tick boxes + note
verdicts inline; (5) commit `PARITY.md` with whatever shipped (push to `main`).

---

## Part 1 — Feature roster (the rows)

~33 user-facing features. Anchors are the feature's _reach_: tables (migration
numbers), endpoints (`worker/routes.ts` names), pages/components, shared query
keys (`src/lib/queryKeys.ts`). A feature missing an anchor kind isn't a gap per
se (Recherche has no table) — the anchors just tell the auditor where to look.

### Board (Le babillard)

| #   | Feature                                 | Tables                                         | Endpoints                                 | Pages / components                                                        | Query keys            |
| --- | --------------------------------------- | ---------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| F1  | Agenda & événements                     | events (0001+)                                 | events, month, year, this-week, day-notes | Board, DayPlanPage, EventFormPage, board/MonthView, YearView | EVENTS, MONTH, BOARD  |
| F2  | À faire (corvées) + Projets & entretien | tasks, task_participants, home_projects (0074) | chores, chores-ledger, home-projects      | ChoreFormPage, HomeProjectFormPage, board cards, operator/chores          | CHORES, HOME_PROJECTS |
| F3  | À compléter (todos, loose)              | todos, todo_templates (0046/0047/0116)         | todos, todo-templates                     | todos/\*, TodoSection (`show='loose'`)                                    | TODOS, TODO_TEMPLATES |
| F35 | Avant de partir (checklists + bring)    | todos.source_template_id (0116/0117), events.bring_template_id (0077) | todos, todo-templates                     | DepartureCard, DeparturePage, ActivityBring, TodoSection (`show='checklists'`) | TODOS, TODO_TEMPLATES, MONTH, WEATHER |
| F4  | Notes frigo (texte/audio/dessin/photo)  | notes (0018, media trio 0043/0055)             | notes, note-media                         | board/Notes, MemoControls, DrawPad                                        | BOARD                 |
| F5  | Mots (« Laisse un mot »)                | mots (0094/0095/0123)                               | mots                                      | MotsCard, mots/\*                                                         | MOTS                  |
| F6  | Mes habitudes (+ « Le défi du jour »)   | habits, habit_days (0112), habit_marks (0115)  | habits                                    | HabitudesPage, HabitFormPage, habits/\*, HabitudesCard, DefiBlock         | HABITS                |
| F7  | Photos / cadre                          | photos (0006)                                  | photos                                    | operator/photos, AmbientScreen                                            | PHOTOS                |
| F8  | Dessins (galerie)                       | drawings (0056)                                | drawings                                  | DrawingGalleryPage, DrawPad                                               | DRAWINGS              |
| F9  | Capture (＋ / AddSheet / partage PWA)   | captures                                       | capture, ask, transcribe, a-regler        | AddSheet, AskSheet, CaptureForm, QuickAddPage, /share                     | A_REGLER              |
| F10 | Recherche                               | — (client-side over caches)                    | —                                         | SearchPage, lib/searchIndex.ts                                            | (reads all)           |
| F11 | Le babillard (widget space lui-même)    | household prefs (layout local)                 | board, today-changes, weather, wonder     | Board, WidgetGrid, CardSlot, lib/boardCards, operator/boardLayout         | BOARD, WEATHER        |

### La cuisine

| #   | Feature                                  | Tables                                                    | Endpoints                                                                                | Pages / components                                                                   | Query keys              |
| --- | ---------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| F12 | Plan des repas                           | meals (0001+)                                             | meals, meal-staples                                                                      | kitchen/MealPool, DayEditor, operator/meals                                          | (kitchen/types.ts keys) |
| F13 | Idées de repas                           | meal_ideas (0025/0108)                                    | meal-ideas, suggest-meal                                                                 | kitchen/MealIdeas, IdeasDrawer, IdeasPage                                            | (kitchen keys)          |
| F14 | Restants                                 | meal_leftovers (0035)                                     | meal-leftovers                                                                           | kitchen/\*, buildLeftover peek                                                       | (kitchen keys)          |
| F15 | Recettes (livre, import, cook mode, ❤)   | recipes (0008+), recipe_loves (0044)                      | recipes, recipe-\* (draft/image/import/ocr/vision/tags/step-image/to-list), recipe-loves | RecipeBookPage, RecipeViewPage, RecipeFormPage, CookPage, MultiCookPage, HeartButton | LOVES + kitchen keys    |
| F16 | Garde-manger (bas / à écouler / réserve) | pantry_low, pantry_use_soon (0010), pantry_reserve (0036) | pantry, use-soon, reserve                                                                | kitchen/PantryTab, ReserveSection, operator/reserve                                  | (kitchen keys)          |
| F17 | Vide-frigo & suggestions IA              | —                                                         | empty-fridge, suggest-meal                                                               | kitchen ＋ tile, VideFrigo flow                                                      | —                       |
| F18 | Circulaires & aubaines                   | — (Flipp reconstruction)                                  | deals, flyer, flyers, flyer-img, place-import                                            | CirculairesPage, PriceMatchPage                                                      | FLYERS                  |

### La liste

| #   | Feature                     | Tables                                  | Endpoints            | Pages / components                                          | Query keys      |
| --- | --------------------------- | --------------------------------------- | -------------------- | ----------------------------------------------------------- | --------------- |
| F19 | La liste (+ allées, caisse) | list_items (0001+, 0078 position, 0110) | list, recipe-to-list | Liste, ListEditPage, CashierPage, PriceMatchPage, lib/picks | (liste keys)    |
| F20 | Fantômes & déjà acheté      | ghost_items, purchase_log (0005+)       | ghost                | operator/shopping, ghost strip                              | GHOSTS, HISTORY |

### Le cercle

| #   | Feature                         | Tables                                                             | Endpoints                           | Pages / components                                                        | Query keys                   |
| --- | ------------------------------- | ------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| F21 | Personnes & familles            | contacts (0049+), contact_links (0049/0050), contact_photos (0054) | cercle, cercle-links, cercle-photos | Cercle, CercleFormPage, CercleFamilyPage, FamilyBuilder, FamilyImportPage | CERCLE                       |
| F22 | Groupes                         | contact_groups (+members) (0052)                                   | cercle-groups                       | GroupForm, Social view                                                    | CERCLE                       |
| F23 | Animaux                         | pets (0071)                                                        | pets                                | CerclePetPage, PetForm                                                    | CERCLE                       |
| F24 | Business                        | businesses (0063/0065)                                             | businesses                          | cercle/BusinessesTab, BusinessForm                                        | BUSINESSES                   |
| F25 | Notes du cercle                 | family_notes (0062/0093/0111)                                      | family-notes                        | cercle/CercleNotes, NoteEditor, NotesList                                 | FAMILY_NOTES                 |
| F26 | Carnets (+ care-log, home-pins) | carnets, care_log, home_pins (0082)                                | carnets, care-log, home-pins        | CercleCarnetPage, CarnetForm, CarnetDocs                                  | CARNETS, CARE_LOG, HOME_PINS |
| F27 | Notre monde                     | — (derived)                                                        | —                                   | CercleWorldPage, lib/cercle layouts                                       | CERCLE                       |

### Routines

| #   | Feature           | Tables                                      | Endpoints                                                   | Pages / components                                       | Query keys |
| --- | ----------------- | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| F28 | Routines & player | routines, routine_runs (0001+, timers 0079) | routines, routine-audio, routine-card-photo                 | Routines, RoutineFormPage, RoutineRunPage, RoutinePlayer | ROUTINES   |
| F29 | Mur de collants   | routine_stickers (0105)                     | routine-stickers                                            | StickerWallPage                                          | STICKERS   |
| F30 | Jouer             | —                                           | —                                                           | JouerPage, jouer/\*                                      | —          |

### Transversal

| #   | Feature                                                                 | Tables                                                                                        | Endpoints                                                         | Pages / components                                                                       | Query keys                          |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| F31 | Voyage (privé + partagé)                                                | trips + trip_notes/packing (0092), shared_trips + 3 (0101)                                    | trips, trip-_, shared-trip-_ (11)                                 | VoyagePage, SharedVoyagePage, DeparturePage, voyage/\*                                   | TRIPS*, SHARED_TRIP*                |
| F32 | L'auto                                                                  | schedule_blocks (0069), car_day (0070), household cars, events.car_id (0068) + end_at (0118)   | car, car-day, schedule, events                                    | VoiturePage, AutoCard, operator/schedule, EventForm (« Prend l'auto »)                    | CAR, SCHEDULE, MONTH                |
| F33 | Partager & invités (guest links, intake, postbox, partage public, demo + claim) | guests (0098+), intake*\* (0075/0076), postbox*\* (0085), shares (0102), family_shares (0100) | guest\*, intake, postbox, share, share-public, family-share, demo, demo/claim | ShareModal, IntakeForm, Postbox, PartagePage, FamilyWindowPage, operator/guest + reviews, SampleBanner (claim face), ClaimPage | SHARES, guestWindowKey              |
| F34 | Réglages, appareils & veille                                            | devices, pairing_codes, household(+preferences 0106)                                          | pair/_, members, household, takeout, health, ai-_                 | Operator, Pair, Setup, operator/\* (~28 sections), lib/ambient                           | DEVICES, MEMBERS, HOUSEHOLD, HEALTH |

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

**D2 — Detail peek.** Tapping the item where it appears as a _row/mention_ opens
`useEntityDetail` with a real adapter. Source: `src/components/detail/adapters.ts`
(10 builders) + `DetailKind` in `src/lib/detail.ts`. ➖ verdicts already recorded
in code: recipe, routine (navigate to their scene instead — "tap the thing, get
the thing"), notes & carnet scene (media-first, too rich for a peek). Recipe:
grep `adapters.ts` for the entity; if absent, decide ➖ (write the why) or ❌.

**D3 — Undo vs confirm, correctly assigned.** Light delete → undo toast via
`useDeferredRemoval` (mandatory for live-polled lists — flash-back glitch);
heavy/cascading delete → `useConfirm`. Score 🔶 if a _light_ delete uses a heavy
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
(`functions/_lib/realtime.ts`) with the _right_ keys, or intentionally in
`SILENT_PATHS`. Unmapped writes fall through to `[['board']]` (safe but
over-broad → 🔶). Recipe: read `PATH_KEYS`/`SILENT_PATHS` for the feature's
endpoint names; check keys match `queryKeys.ts`.

**D6 — Search.** The entity has a `SEARCH_INDEX` entry (`src/lib/searchIndex.ts`;
"searchable = has an entry"). ➖ for ephemeral/derived things (weather, runs).
Recipe: grep the kind in `SEARCH_INDEX`. _(Dry-run finding: `habit` is absent —
F6 is unfindable from Recherche. Pre-scored ❌.)_

**D7 — Guide card + « ? » help + tour.** Three sub-scores: (a) a guide card in
`src/lib/guideContent.ts` (32-card ceiling — **merge into an existing card
first**, per `DISCOVERY.md`); (b) coverage by one of the **8** help registries
(`addHelp/boardHelp/cercleHelp/kitchenTabHelp/listeHelp/notesHelp/operatorHelp/routinesHelp.ts`)
**or by the `SceneHead card=` / `HelpDot` channel** — counting registries alone is what
made five features look dark in Appendix A for six weeks;
(c) a tour step (`lib/tourContent.ts`, **7** tours; optional — see Appendix A ➖ᵀ). Guards:
`helpRegistry.test.ts`, `guideLinks.test.ts`. Known candidates from exploration:
Voyage, Mots, Carnets, Habitudes, L'auto, Dessins have thin/no help-mode
coverage — verify per row. Read `DISCOVERY.md` before fixing anything here.

**D8 — Toddler/Simple lens.** The page renders something _deliberate_ under
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
soft member ref / `author_member_id` / external `author_label`) and _shown_
(Avatar tint, never counts/ranks — chore-ledger rule). Recipe: check the table's
`*_by` columns + whether the UI surfaces the face.

**D13 — Schema hygiene.** `colour` not `color`, `position` not `sort_order`,
`deleted_at` for soft delete, JSON columns `NOT NULL` with defaults, soft refs
commented. Forward-rule only — don't churn working tables; score 🔶 with a
"converge opportunistically" note. **The scalar `color`→`colour` (mig 0087) and
`sort_order`/`sort`→`position` (mig 0086) convergences have already shipped**, so
those cells are ✅ (footnotes 3, 21). Remaining exceptions are all sanctioned ➖:
`carnets.archived_at` (reversible archive) and `notes.dismissed_at` (soft-clear,
footnote 22).

**D14 — Media pattern.** Attachments use the `media_kind` + `media_key`
(+ `scene_key`) trio and `uploadMedia()`, old blobs freed on replace/clear, R2
unset → controls hide. Known 🔶 (DB-1 deferred, opportunistic): recipes
`image` + parallel step-image arrays; routines parallel card-audio/photo arrays.

**D15 — i18n register.** FR/EN key _parity_ is tsc-enforced (`typeof FR`) — this
column only audits **register**: Québécois FR (souper, céduler, courriel), no
France-French drift, toddler-facing strings speakable by TTS. Recipe: read the
feature's `i18n.ts` block aloud.

**D16 — e2e coverage.** At least one spec exercises the feature's happy path
(~71 specs in `e2e/`). Known gaps from exploration (verify): L'auto/VoiturePage,
mur de collants, price-match, deals/circulaires browsing, family-import.
Recipe: grep `e2e/` for the feature name; check the visual sweep specs too.

**D17 — Action reachability.** Every user action the feature exposes has a
non-touch, non-hidden door AND a considered undo tier. ✅ = each action reaches
through a Part-1 channel of **`ACTIONS.md`** (row furniture / ⋯ / peek / ＋ tile /
Réglages mirror / ⚙ Avancé face), a swipe or long-press is never the only path,
and every destructive door names deferred / compensating / confirm / ➖-with-why.
Recipe: read the feature's rows in `ACTIONS.md` Part 2 — **the per-action detail
lives there, not in a 17th column below** (this table stays 16 columns; D17 is
scored by the ACTIONS.md row being gap-free, same pattern as D7 → `DISCOVERY.md`).

---

## Part 3 — The matrix (filled on audit days)

> Fill cells with ✅ / ➖ / ❌ / 🔶 / ❓. A ➖ or 🔶 cell must have a footnote.
> Pre-filled cells below come from the 2026-07-10 exploration + dry-runs and are
> **already verified**; everything else starts ❓.

| Feature                  | D1 CRUD | D2 Peek | D3 Undo | D4 Offline | D5 RT | D6 Search | D7 Guide | D8 Toddler | D9 Kiosk/Mob | D10 Voice | D11 Empty | D12 Who | D13 Schema | D14 Media | D15 i18n | D16 e2e |
| ------------------------ | ------- | ------- | ------- | ---------- | ----- | --------- | -------- | ---------- | ------------ | --------- | --------- | ------- | ---------- | --------- | -------- | ------- |
| F1 Agenda                | ✅      | ✅      | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | ➖¹       | ✅       | ✅      |
| F2 Corvées+Projets       | ✅⁶⁶    | ✅      | ✅⁶⁶    | ✅         | ✅    | 🔶²       | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅³        | ➖¹       | ✅       | ✅⁶⁶    |
| F3 Todos (loose)         | ✅      | ✅      | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | ➖¹       | ✅       | ✅⁵⁴    |
| F35 Avant de partir      | ✅⁵⁹    | ➖⁴     | ✅      | ✅         | ✅    | ➖⁶⁰      | ✅       | ➖⁴⁸       | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅⁵⁹       | ➖¹       | ✅       | ✅⁶¹    |
| F4 Notes frigo           | ✅      | ➖⁴     | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ✅        | ✅        | ✅      | ➖²²       | ✅        | ✅       | ✅      |
| F5 Mots                  | ✅      | ✅      | ✅      | ✅         | ✅    | ✅⁵¹      | ✅⁵³     | ✅⁵²       | ✅           | ✅        | ✅        | ✅      | ✅         | ✅        | ✅       | ✅      |
| F6 Habitudes             | ✅⁵⁷    | ✅⁵⁷    | ✅      | ✅         | ✅    | ✅⁵       | ✅⁵³     | ✅⁵²       | ✅           | ✅        | ✅        | ✅      | ✅         | ➖¹       | ✅       | ✅      |
| F7 Photos                | ✅      | ➖      | ✅      | ➖⁷        | ➖⁷   | ➖        | ✅       | ✅         | ✅           | ➖        | ✅        | ➖³⁰    | ✅         | ✅        | ✅       | ✅      |
| F8 Dessins               | ✅      | ➖⁴     | ✅      | ➖⁷        | ✅    | ✅        | ✅⁵³     | ✅         | ✅           | ➖        | ✅        | ✅      | ✅         | ✅        | ✅       | ✅      |
| F9 Capture               | ➖²⁴    | ➖      | ➖      | 🔶⁸        | ✅    | ➖        | ✅       | ➖⁴⁸       | ✅           | ✅        | ✅        | ➖³¹    | ➖         | ➖¹       | ✅       | ✅      |
| F10 Recherche            | ➖      | ➖      | ➖      | ➖         | ➖    | ✅        | ✅       | ➖⁴⁸       | ✅⁵⁴         | ➖⁴⁷      | ✅        | ➖      | ➖         | ➖        | ✅       | ✅      |
| F11 Widget space         | ✅      | ➖      | ➖⁴⁴    | ➖⁹        | ➖    | ➖        | ✅       | ✅         | ✅           | ➖        | ✅        | ➖      | ➖         | ➖        | ✅       | ✅      |
| F12 Plan repas           | ✅      | ✅      | ✅      | ✅         | ✅    | ✅⁵¹      | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | ➖        | ✅       | ✅      |
| F13 Idées repas          | ✅      | ➖⁴³    | ✅      | ✅         | ✅    | ✅⁵¹      | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | ➖        | ✅       | ✅      |
| F14 Restants             | ✅      | ✅      | ✅      | ✅         | ✅    | ➖²⁷      | ✅       | ✅         | ✅           | ➖        | ✅        | ➖³²    | ✅         | ➖        | ✅       | ✅⁵⁴    |
| F15 Recettes             | ✅      | ➖⁴     | ✅      | ✅⁶³       | ✅    | ✅        | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | 🔶¹⁰      | ✅       | ✅      |
| F16 Garde-manger         | ✅      | ➖⁴³    | ✅      | ✅         | ✅    | ✅        | ✅       | ➖⁴⁸       | ✅           | ✅        | ✅        | ➖³³    | ✅         | ➖        | ✅       | ✅      |
| F17 Vide-frigo           | ➖      | ➖      | ➖      | ➖⁸        | ➖    | ➖        | ✅⁵³     | ➖⁴⁸       | ✅           | ➖⁴⁷      | ➖³⁶      | ➖      | ➖         | ➖        | ✅       | ✅      |
| F18 Circulaires          | ➖²⁵    | ➖⁴³    | ➖⁴⁵    | ✅         | ✅    | ➖²⁸      | ✅       | ➖⁴⁸       | ✅⁵⁴         | ➖        | ✅        | ➖      | ➖         | ➖        | ✅       | ✅      |
| F19 La liste             | ✅      | ➖⁴³    | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ✅        | ✅        | ✅      | ✅         | ➖        | ✅       | ✅      |
| F20 Fantômes             | ✅¹⁷    | ➖⁴³    | ✅      | ✅⁵⁶       | ✅    | ➖²⁹      | ✅       | ➖⁴⁸       | ✅           | ➖        | ✅        | ➖³⁴    | ✅         | ➖        | ✅       | ✅      |
| F21 Personnes            | ✅      | ✅      | ✅      | ➖²⁰       | ✅    | ✅        | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ➖      | ✅         | ✅        | ✅       | ✅      |
| F22 Groupes              | ✅      | ➖⁴³    | ✅      | ✅         | ✅    | ✅⁵¹      | ✅       | ➖⁴⁸       | ✅           | ➖        | ✅        | ➖      | ✅²¹       | ➖        | ✅       | ✅      |
| F23 Animaux              | ✅      | ✅      | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ➖        | ✅        | ➖      | ✅         | ✅        | ✅       | ✅⁵⁴    |
| F24 Business             | ✅      | ✅      | ✅      | ✅         | ✅    | ✅        | ✅       | ➖⁴⁸       | ✅           | ➖        | ✅        | ➖      | ✅         | ✅        | ✅       | ✅      |
| F25 Notes cercle         | ✅      | ➖⁴     | ✅      | ✅         | ✅    | ✅        | ✅       | ➖⁴⁸       | ✅           | ✅        | ✅        | ✅      | ✅         | ✅        | ✅       | ✅      |
| F26 Carnets              | ✅      | ➖⁴     | ✅      | ✅         | ✅    | ✅        | ✅       | ➖⁴⁸       | ✅           | ➖⁴⁷      | ✅        | ➖³⁵    | ✅³ ²¹     | 🔶²³      | ✅       | 🔶¹¹    |
| F27 Notre monde          | ➖      | ➖⁴³    | ➖      | ➖         | ➖    | ➖        | ✅       | ✅         | ✅           | ➖        | ✅        | ➖      | ➖         | ➖        | ✅       | ✅      |
| F28 Routines             | ✅      | ➖⁴     | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ➖⁴⁷      | ✅        | ✅      | ✅         | 🔶¹⁰      | ✅       | ✅      |
| F29 Collants             | ✅      | ➖      | ✅⁵⁵    | ✅         | ✅    | ➖        | ✅⁵³     | ✅⁵⁰       | ✅           | ➖        | ✅        | ✅      | ✅         | ➖        | ✅       | ✅⁵⁴    |
| F30 Jouer                | ➖      | ➖      | ➖      | ➖         | ➖    | ➖        | ✅⁵³     | ✅         | ✅           | ➖⁴⁷      | ➖³⁷      | ➖      | ➖         | ➖        | ✅       | ✅⁵⁴    |
| F31 Voyage               | ✅      | ➖⁴³    | ✅      | ✅         | ✅    | ✅⁵¹      | ✅⁵³     | ➖⁴⁸       | ✅           | ✅        | ✅        | ✅      | ✅         | ✅        | ✅       | ✅      |
| F32 L'auto               | ✅¹⁸    | ➖⁴³    | ✅      | ✅         | ✅    | ✅        | ✅       | ✅         | ✅           | ➖        | ✅        | ✅      | ✅³        | ➖        | ✅       | ✅⁵⁴    |
| F33 Partager & invités   | 🔶²⁶    | ➖      | ✅      | ➖¹²       | 🔶    | ➖        | ✅       | ➖         | ➖           | ➖⁴⁷      | ✅        | ✅¹³    | ✅         | ✅        | ✅       | ✅⁶⁴    |
| F34 Réglages & appareils | ✅      | ➖      | ✅      | ➖¹²       | ✅    | ➖        | ✅       | ➖¹⁴       | ➖           | ➖⁴⁷      | ✅        | ➖      | ✅²¹       | 🔶²³      | ✅       | ✅      |

Footnotes (verdicts recorded so far):

1. No media attachment by design — the entity is text/derived only.
2. Home projects searchable; loose chores ("À faire") — verify which kinds `SEARCH_INDEX` covers.
3. **CONVERGED (mig 0087, already shipped).** The `color` outliers `tasks`/`home_projects`/`schedule_blocks`/`carnets` (+ the household JSON-pref columns) were renamed to `colour`; readers alias `colour AS color` so the API JSON stays byte-identical. Cells 🔶→✅. Only non-column spellings remain out of scope (the `color?` keys _inside_ reserve_locations/cars JSON, and the `avatar_kind='color'` discriminator value) — see UNIFORMIZING DB-2.
4. Deliberate no-peek verdict recorded in `adapters.ts` L387-397 / UNIFORMIZING: tapping navigates to the full page/scene ("tap the thing, get the thing").
5. **Dry-run confirmed 2026-07-10; FIXED (Wave S) 2026-07-10**: `habit` now has a `SEARCH_INDEX` entry (title) + a « Mes habitudes » SearchPage section → `/board/habitudes`. See ⁵¹.
6. Guide card `habits` + `operatorHelp:habits` exist, but no « ? » help on the board/HabitudesPage surface itself and no tour step (audited 2026-07-10, Appendix A).
7. Two-step R2 upload — exempt from useWrite/realtime per LIB-1 verdict.
8. AI round-trip (capture classify / vide-frigo) can't be queued offline — exempt, but the _fallback_ manual path must work offline; verify.
9. Board layout is device-local localStorage (`lib/boardCards`), not a server write.
10. DB-1 deferred: parallel media arrays (recipe step-images, routine card-audio/photos) instead of the trio — opportunistic convergence only.
11. Carnet restore/scene covered; care-log flows beyond restore unspecced.
12. Auth/pairing/guest flows are online-only by nature.
13. Postbox exact-name-match tinting is THE template for guest→household attribution (P2-8).
14. Settings locked away from toddler by design (kid one-way door).
15. **Guide-only** (Appendix A): a guide card explains it, but no « ? » help entry and no tour step on its live surface. Tour absence alone is not a gap (tours are deliberately narrow); guide-without-help is 🔶 because the "?" is the in-place channel.
16. **Fully undiscovered**: no guide card, no help entry, no tour step. `playContent.ts` powers the toddler play space but the discovery layer never mentions it.
17. **D1 verified 2026-07-10**: `ghost.ts` has no `onRequestPost` **by design** — a ghost is _enrolled_ from an existing purchase via PATCH (buying never auto-enrolls); edit + delete both present. Adding a create endpoint would reopen the auto-learning the calm tenet forbids, so this is full-CRUD-by-deliberate-shape, not a gap.
18. **D1 verified 2026-07-10**: `car.ts` is a **GET-only resolved read model** (`realtime.ts` L203 says so — "no write path"); the household's cars are edited via `household` PATCH (`household.ts` L206), and `car-day` is a create/delete day-marker (nothing to edit). `schedule` is full CRUD. Whole feature is manageable.
19. **D4 found 2026-07-10 → RESOLVED (Wave O, footnote 56)**: `src/lib/ghost.ts` `patchGhost`/`deleteGhost` called `api('ghost',{method})` directly — enroll/snooze/remove bypassed the offline outbox. Now routed through `useWrite` at the call site; the raw wrappers were deleted.
20. **D4 found 2026-07-10 → TRIAGED ➖ (Wave O) 2026-07-10** (the never-itemized cluster): `FamilyImportPage.tsx` fires **9 raw `api()` writes** (cercle ×4, cercle-links ×2, pets, cercle-groups ×2) for the bulk family-tree import — online-only batch, not queued. Its avatar POSTs are R2 two-step uploads (exempt, ⁷). `DayPlanPage.tsx` (13 writes) and `Board.tsx` (9) turned out **already fully on `useWrite`** — the old "~15/~11 raw" worry was stale. **Verdict on the import batch: keep raw `api()` — record ➖, don't convert.** The merge is a _dependent id-chain_: each `upsertPerson` POST returns a contact id that the subsequent `cercle-links` / pet-owner / `cercle-groups` writes reference by value, and pets/groups POST their own ids consumed by follow-up membership writes. `useWrite` returns `{ data: null, queued: true }` when offline, so a queued person write yields no id and every downstream link/membership breaks — a corrupt half-import, strictly worse than requiring connectivity. The whole page is an interactive online flow (open a share link → live progress bar → done state) with online-only R2 photo re-copies (`copyPhotoToOwn`). This is the sanctioned "online-only batch" ➖, not a gap.
21. **CONVERGED (mig 0086, already shipped).** The ordering outliers `members.sort_order` (F34), `contact_groups.sort_order` (F22), `carnets.sort` + `home_pins.sort` (F26) were renamed to `position`; the API JSON shapes are preserved (members alias `position AS sort_order`; carnets/home_pins keep their `sort` JSON key mapped from the renamed column). Cells 🔶→✅. See UNIFORMIZING DB-3.
22. **RESOLVED ➖ (sanctioned bespoke name).** `notes.dismissed_at` (0018) is a soft-_clear_ timestamp, semantically "cleared not deleted" (a mis-clear is recoverable), and is already commented as such in the migration — the same sanctioned deviation as `carnets.archived_at`. Keep it: a churn-only rename to `deleted_at` would blur the distinct semantic. Cell 🔶→➖. (Per CLAUDE.md ▸ Schema conventions, a bespoke timestamp name is allowed when the semantic genuinely differs and is commented.)
23. **D14 media-shape deviation** (lifecycle still correct — blobs freed via `deleteR2Blob`, shared `uploadMedia` used): `care_log.media_json` is a parallel array of doc keys (F26); `members.avatar_kind`/`avatar_ref` is a bespoke dual-purpose column predating the trio (F34). Normalization backlog, opportunistic only — same class as DB-1 (¹⁰).
24. **D1 deliberate-none**: `capture`/`ask`/`transcribe` are AI _action_ endpoints, not stored entities — the routed note/event/task is CRUD'd in its own feature; `a-regler` is a derived queue. A memo blob rides `note-media` (F4), so capture stores no media of its own (D14 ➖¹).
25. **D1 deliberate-none**: flyer/deal data is transient external (Flipp reconstruction); a deal rides a generic recurring list item (never its own row, per the deal↔item concept); `place-import` is an import action.
26. **D1 mixed**: `share`/`family-share`/`guest-links` are full create+list+revoke; `intake`+`postbox` are inbound **review queues** (GET+PATCH accept/reject, no user-facing delete/edit by design); `demo`/`share-public` are read actions.
27. **D6 verified 2026-07-10** (Day 2): `meal_leftovers` has **no `SEARCH_INDEX` entry** — a leftover is transient (empties as it's eaten) and the dish itself is a **searchable recipe** (`recipe_id`). Deliberate-none, not a gap.
28. **D6 verified 2026-07-10**: circulaires/deals have no `SEARCH_INDEX` entry — transient external Flipp reconstruction (same class as F17); a deal rides a **generic recurring `list_items` row** already searchable via `listItem` (deal↔item concept).
29. **D6 verified 2026-07-10**: `ghost_items` has no `SEARCH_INDEX` entry — a ghost is an opt-in purchase-**cadence flag**; the thing you'd search for is its `list_items` row, already findable via `listItem`.
30. **D12 verified 2026-07-10**: `photos` has **no author column** (id/household/key/created_at) — a shared household cadre/frame, no per-photo "who" by design.
31. **D12 verified 2026-07-10**: `captures` is a **transient AI routing queue** (raw_text/source/resolved_type, no member ref); attribution lands on the routed note/event/task in its own feature (see ²⁴/¹).
32. **D12 verified 2026-07-10**: `meal_leftovers` has no member ref — a household dish; provenance is `source_meal_id`/`recipe_id`, not a person.
33. **D12 verified 2026-07-10**: `pantry_low` carries a `member_id` (whoflagged) but it is **not surfaced**; `pantry_use_soon`/`pantry_reserve` carry none — the garde-manger is a shared household flag that shows no face by design (calm).
34. **D12 verified 2026-07-10**: `ghost_items` has no author column — household shopping cadence, no per-person "who."
35. **D12 verified 2026-07-10**: a carnet's "who" is the servicing **`business_id`** (a cercle business), not a household-member face — it's a reference log of things, not member content. (Faces are absent by design, not a gap.)
36. **D11 verified 2026-07-10**: Vide-frigo is an **AI suggestion flow**, not a persistent list surface — its empty/degraded state is the host IdeasDrawer's (`leftoversEmpty`), and R2/AI-unset hides it. No standalone empty state to own.
37. **D11 verified 2026-07-10**: Jouer is a toddler **play space** that always renders its games (`SeekGame`/`DayTimeline`/`BirthdayCountdown`) — no data-list to empty, no bare `return null`.
38. **D16 verified 2026-07-10**: the « À compléter » board card is **smoke-rendered** in the board sweeps (`board-edit`/`screenshots`, via `todo-templates` mocks) but **no spec creates/completes a todo** — happy-path e2e gap.
39. **D16 verified 2026-07-10**: the ＋ « Restants » compose field is **reached** (keyboard.spec `kitchen-addsheet`) but **no spec POSTs/consumes a `meal-leftovers` row** — happy-path e2e gap.
40. **D16 verified 2026-07-10**: `/cercle/pet/new` is **smoke-rendered** (scenes.spec layout sweep) but — unlike group/business/carnet, which `cercle-crud.spec` creates-and-POSTs — **no spec creates a pet**. Happy-path e2e gap.
41. **D16 verified 2026-07-10**: `/jouer` is **smoke-rendered** at toddler audience (scenes.spec layout sweep, no-overflow asserted) but **no game-interaction happy path** is exercised.
42. **D16 verified 2026-07-10** — **corrects the pre-seeded ❌**: `/voiture` **is** smoke-rendered with a no-overflow layout assertion (scenes.spec `voiture`), so it's not dark; but no schedule/car-day/carpool **CRUD** happy path exists in the default `npm run e2e` (realdata.spec touches it only under the separate real-data harness). Upgraded ❌→🔶.
43. **D2 verified 2026-07-10** (Day 3): no `useEntityDetail` peek — deliberate, by the "tap the thing, get the thing" rule (like recipe/routine ⁴). These tap-targets either **navigate to their own page** (Voyage→trip scene, L'auto→VoiturePage, Groupes→`/cercle/family/:id`, Notre monde→into Le cercle) or are a **one-tap action/toggle** (Idées=plan-this, Garde-manger=toggle a low flag, La liste=check in place, Circulaires=links to the flyer / rides a searchable list item, Fantômes=operator admin RowActions). A peek here would be an inter-tap menu. [F13/F16/F18/F19/F20/F22/F27/F31/F32]
44. **D3 verified 2026-07-10**: the board has **no destructive delete** — hiding/moving a card is a reversible **device-local** toggle (`lib/boardCards`), not a row delete; nothing to undo-or-confirm. [F11]
45. **D3 verified 2026-07-10**: deals aren't user-deletable content (transient Flipp reconstruction ²⁸); the generic recurring list item a deal rides carries the undo. [F18]
46. **D3 found 2026-07-10** — **the one D3 misassignment**: the sticker ✕ (`StickerWallPage.tsx` L62) fires a raw `write('routine-stickers', DELETE)` with **neither an undo toast nor a confirm**, on a live-polled list (`STICKERS_KEY`) — the deferred-removal rule (light, frequent delete → undo) isn't applied. Candidate for `useDeferredRemoval` in Wave U. [F29]
47. **D10 verified 2026-07-10**: voice for these entities lands via the **＋ capture spine** (Whisper→AI-classified to event/task/meal/list/note, F9 ✅) or the surface is a **structured form** (event date/time, chore recurrence, contact phone/address, recipe import/OCR, carnet service log, settings toggles); the in-place quick-add is keyboard by design. Composers that DO carry inline voice: notes ⁴ / mots / pantry / liste / cercle-notes / voyage / habits(HabitForm). [F1/F2/F3/F10/F12/F13/F15/F17/F21/F26/F28/F30/F33/F34]
48. **D8 verified 2026-07-10**: the themed tab **does** branch to a deliberate toddler view (ToddlerBoard / KidKitchen / CircleKidView / Liste toddler), which **curates this operator/organizational sub-feature out** — a design fold, not a missing branch. Capture(＋ FAB) & search are hidden by the kid one-way door (`HubLayout` L325/382); pantry/vide-frigo/circulaires/ghost/groups/business/cercle-notes/carnets/Voyage are folded out of the kid lens; Partager is operator plumbing. [F9/F10/F16/F17/F18/F20/F22/F24/F25/F26/F31/F33]
49. **D9 found 2026-07-10**: no board card **and** the scene route is **not in any phone-overflow e2e sweep** (`screenshots.spec`/`layout-overflow.spec` cover the six hub tabs at 360/390px, not `/search` or `/circulaires`). The layout likely reflows (grid/`Cluster`) but its phone width is **unproven** — add both routes to `OVERFLOW_CASES`. [F10/F18]
50. **D8 soft-✅ 2026-07-10**: `StickerWallPage` has **no explicit `useAudience` branch** — the same wall renders across lenses — but it is inherently picture-first (avatar + sticker-emoji grid, no reading), so it satisfies the toddler bar by nature. Under a strict "must branch" reading this drops to ❓. [F29]
51. **Wave S SHIPPED 2026-07-10** — the six dark D6 kinds now each have a `SEARCH_INDEX` entry (`src/lib/searchIndex.ts`) + a rendered SearchPage section: **habit** (title→`/board/habitudes`), **mot** (body-only secondary hit, like `fridgeNote`→`/board`), **meal** & **mealIdea** (title, both filtered `!recipe_id` so recipe-linked ones surface via the recipe, not twice→`/kitchen/day/:date` & `/kitchen/idees`), **group** (name; family→`/cercle/family/:id`, else `/cercle?section=social`), **trip** (title + destination/notes→`/voyage/:id`). All read warm caches / shared hooks (no new fetch): groups ride the widened `CERCLE_KEY` query; habits via `useHabits({live:false})`; meals via `useMeals()`; trips via `useTrips()`; mots via `useAllMots()`; ideas inline on `MEAL_IDEAS_KEY`. FR+EN labels added (`t.search.{habits,mots,meals,ideas,groups,trips}`). Guard: `e2e/search.spec.ts` « Wave S » test seeds/asserts one of each kind. [F5/F6/F12/F13/F22/F31×D6] **Widened 2026-08-27 (migration 0123):** a VOICE mot is searchable by its transcript now — it carried no text at all before, so a message someone SPOKE was unfindable by construction (you could only remember which face left it and scroll). `mot` matches on `[text, transcript]` joined. [F5×D6]
52. **Wave T SHIPPED 2026-07-10** — the two real D8 gaps closed by folding both into
    `ToddlerBoard` as picture-first, hear-first `BigTiles` sections (the same primitive
    every other kid-lens section uses — no new component). **F5 Mots** « Un mot pour toi »:
    the waiting mots for the picked face (+ Maisonnée), a drawing/photo shown in the tile,
    a voice memo playing the sender's clip on tap (`playNarration`, TTS fallback), a text
    mot read aloud — tinted by the sender, hidden from a guest (privacy, like the parent
    card), presence-only (never a count). **F6 Habitudes** « Mes habitudes »: the habits
    still asking today for the picked face, tiles carrying the SAME `habitReading` line the
    parent `HabitudesCard`/`HabitRow` use (« 0 sur 2 verres »), read aloud on tap — a parent
    still marks them in « Le point du jour » (read-aloud, never a mark from the kid lens).
    Both read non-polling (`useMots({live:false})` — a new opt mirroring `useHabits` — and
    `useHabits({live:false})`) so a locked kiosk adds no poll (the free-tier lever); both
    self-hide when nothing waits/asks. `t.mots.kidTitle` added (FR/EN). Guard:
    `e2e/interactions.spec.ts` « Mes habitudes » test asserts the toddler board renders a
    due household habit as a tile and a tap does NOT fire a habits write. typecheck + 1436
    unit tests green. [F5/F6×D8]
53. **Wave H SHIPPED 2026-07-10** — the D7 « ? »/guide gaps closed via the two channels
    the app already uses, picked per surface (merge-first, no new registry, no new card):
    **F30 Jouer** (was ❌ on all three) — a « Jouer » **point appended to the `routines`
    guide card** (route `/jouer`), so the toddler play space is discoverable in the guide +
    FeatureMap; its « ? »/tour stay ➖ by nature (a toddler surface — `HelpDot` hides for
    the toddler audience, tours are narrow). **F5 Mots** — a real in-place `BOARD_HELP.mots`
    entry threaded through `MotsCard`'s `Section` (armed « ? » → tap the title → bubble →
    guide `mots`). **F8 Dessins** (`DrawingGalleryPage`) + **F29 Collants** (`StickerWallPage`)
    — a `SceneHead card=` `HelpDot` each (`drawings`/`routines`), the scene-appropriate on
    -surface « ? » (neither had any before). **F17 Vide-frigo** — a `HelpDot card="kitchen"`
    on the `EmptyFridgeSheet` title (also already folded into the ＋ `ideas` bubble). **F6
    Habitudes** + **F31 Voyage** — **verdict correction**: both live surfaces ALREADY carry a
    `SceneHead card=` `HelpDot` (`HabitudesPage` card="habits", `VoyagePage` card="voyage");
    the Day-3 audit counted only the 7 help REGISTRIES and undercounted the `HelpDot` channel,
    so these were never truly help-dark. (The board `HabitudesCard` is a `<Link>`; an armed
    help-title inside it navigates instead of bubbling — the scene `HelpDot` is the right
    channel there, not a board help-mode entry.) Guard: `e2e/help.spec.ts` « Mots » test arms
    the board « ? », taps the card title, asserts the in-place bubble + its `card=mots` guide
    link (per-test `/api/mots` override, so no board snapshot moves). typecheck +
    `helpRegistry`/`guideLinks` + 1436 unit tests green. [F5/F6/F8/F17/F29/F30/F31×D7]
54. **Wave E SHIPPED 2026-07-10** — the smoke-only e2e gaps closed by extending sweeps
    (no new harness), `cercle-crud.spec` the create-and-POST template. **F29 Collants**
    (was ❌ — first-ever spec): new `e2e/stickers.spec.ts` — an all-done routine at
    `/routine/r1/run` (calm off) shows the completion picker → asserts the **POST**
    `routine-stickers`; the wall (`/routine/stickers`, seeded via override) renders two
    stickers and edit-mode ✕ asserts the **DELETE**. **Entry 10** (smoke→happy): **F23**
    pet create → `cercle-crud.spec` (`/cercle/pet/new` POST `pets`); **F3** todo + **F14**
    restants → `interactions.spec` (board ＋ « À compléter » POST `todos`; kitchen ＋
    « Restants » POST `meal-leftovers`); **F30** jouer + **F32** voiture →
    `e2e/play-and-car.spec.ts` (the find-it game reaches « Bravo »; the car week-editor
    POSTs `car-day`). **Entry 11** (F10/F18×D9): `/search` + `/liste/circulaires` added to
    `screenshots.spec` `OVERFLOW_CASES` (360/390px, FR+EN) — the poll now also inspects
    `.scene__body` for scene routes; all 8 pass (no phone overflow). All new specs pass
    locally; typecheck green. [F3/F14/F23/F29/F30/F32×D16, F10/F18×D9]
55. **Wave U SHIPPED 2026-07-10** — the one D3 misassignment (footnote 46) closed.
    **F29 Collants** (was 🔶 — raw DELETE, no undo/confirm): `StickerWallPage` now runs the
    sticker ✕ through `useDeferredRemoval(STICKERS_KEY)`, the same calm-delete every polled
    list uses. `all = removal.visible(stickersQ.data.stickers)` filters the wall (empty
    check + grouping ride the filtered array), so a removed cell hides at once and no
    poll/realtime/invalidate can resurrect it; `removal.remove([id], t.routines.stickerWallRemoved, …)`
    holds the DELETE behind the undo toast and awaits a refetch before un-hiding. New i18n
    key `stickerWallRemoved` (FR « Autocollant retiré » / EN « Sticker removed »). The
    `stickers.spec` DELETE test was rewritten (superseding footnote 54's raw-DELETE assert):
    ✕ hides the cell + surfaces the toast with **zero** DELETE fired, undo restores it still
    with no write. typecheck + 1436 unit tests + `stickers.spec` (2) green. [F29×D3]
56. **Wave O SHIPPED 2026-07-10** — the D4 outbox-bypass closed. **F20 Fantômes** (was
    🔶 — footnote 19): `GhostSection`'s four mutations now go through the offline outbox.
    `track` / `save` / `remove` / `add` call `write('ghost', { method, body, affectedKeys:
[GHOSTS_KEY] })` (useWrite) instead of the raw `patchGhost`/`deleteGhost` `api()`
    wrappers, so a retune/track/remove/add made offline **queues + replays** — matching the
    sibling `write('list', …)` calls in the same file and `QuickAddPage`'s ghost-mute. The
    dead `patchGhost`/`deleteGhost` exports **and** the now-orphan `GhostPatch` type were
    deleted from `lib/ghost.ts` (it stays read-only: `fetchGhosts`/`fetchGhostManage`), so
    the bypass can't be re-introduced by importing a wrapper. `affectedKeys` refreshes the
    Liste quick-add panel; the section's local `load()` still refreshes the manage view.
    typecheck + 1436 unit tests + `interactions.spec` ghost PATCH tests green; knip shows no
    new dead exports (3 fewer). F21 stayed raw by design (➖, footnote 20). [F20×D4]
57. **Wave P SHIPPED 2026-07-10** — the last D2 ❌ resolved to a **deliberate ➖**.
    **F6 Habitudes** had no `useEntityDetail` peek. Verdict: **no `buildHabit` adapter** —
    the board `HabitudesCard` is one `<BoardCard to="/board/habitudes">`, so a tap opens
    « Le point du jour » (`HabitudesPage`) where check-in (`HabitRow`), history
    (`HabitHistory`) and edit already live; the habit rows aren't independently tappable, so
    there's no per-habit entity to peek — a sheet would be a redundant menu in front of the
    page. Same "tap the thing, get the thing" rule as `buildRoutine`/`buildRecipe`/recipe-
    meal; recorded in that NOTE block in `adapters.ts`. No code behaviour change (a comment +
    the matrix verdict); typecheck + 1436 unit tests green.
    **REVISED 2026-08-03 (Marc: "a way to edit habits that is more accessible") — the ➖ is
    now a ✅.** The premise flipped: the card's rows ARE tappable now, each opening a
    `buildHabit` peek (today's reading via `habitReading`, the gentle `weekDone` count, the
    owner face) whose « Modifier » is the reachable edit door — the check-in scene buried it
    two taps deep, and a habit not due today had NO edit door at all. « Le point du jour »
    keeps an explicit link on the card and stays the only marking surface (the peek grows no
    write path). The board ＋ « Mes habitudes » tile also became **`habit-pick`** (the
    `routine-pick` shape): « Nouvelle habitude » + every existing habit (non-due + paused
    included) one tap from its edit form, using the previously-orphaned `t.habits.manage`
    string as the group label. [F6×D2, F6×D1]
58. **« Le défi du jour » SHIPPED 2026-07-10** — a day-long family défi (« porte du jaune »,
    « salue une nouvelle personne ») added to F6, front of `HabitudesCard` + « Le point du
    jour » + the toddler board, via the shared **`DefiBlock`** (one surface, two mounts). It
    **rides `habits` end-to-end** rather than a new feature: the défi is one standing
    `kind='defi'` household habit (excluded from every habit list by `visibleHabits`/`dueToday`/
    `month.ts`), today's text lives on its `habit_days.note`, and per-face check-ins are the
    single new table **`habit_marks` (mig 0115)** — the `task_participants` shape. Deck of ~500
    bilingual défis in `src/lib/defiDeck.ts` (offline-first pige with a recent-window exclude;
    optional AI `suggest-defi` deferred). **Keeps F6 gap-free:** D1 commit/mark/un-mark
    (`useCommitDefi`/`useToggleDefiMark`), D3 light un-mark (toggle), D4 `useWrite`, D5 the
    existing `habits` `PATH_KEYS`, D6 already-indexed by title (footnote 51), **D8 a hear-first
    toddler BigTile** (tap to hear, tap to check off), D12 **marks shown as faces, never a
    count** (the chore-ledger rule; `member` deletion detaches via `habit_marks` cleanup in
    `_lib/members`), D14 ➖ (no media — the optional « preuve en photo » deferred), D2 ➖ (shows
    in place, no separate peek — as footnote 57). **The card no longer wraps everything in one
    `<Link to>`** (a `<button>` inside `<Link>` is invalid) — the défi block keeps its buttons,
    and only the habits list navigates (`.habitudes-card__open`), so footnote 57's peek verdict
    stands. Calm test + 1446 unit tests + `e2e/defi.spec.ts` (3 tests) + habits/overflow sweeps
    green. Guide: merged a point into the `habits` card (`lib/guideContent.ts`). [F6×D1/D8/D12]

59. **« Avant de partir » split SHIPPED 2026-07-10 (F35, migs 0116/0117)** — checklist
    instances are their own concept: `todos.source_template_id` (soft ref, commented, no FK)
    marks a row instantiated from a `todo_templates` checklist; instantiation is ALWAYS
    day-pinned server-side (a day-less template POST defaults to today, and the day is
    FLOORED to today — a past day would be insert-then-swept in the same batch — so no
    global or past-day departure list can exist) and past-day instances are swept
    opportunistically on every todos write, POST + PATCH toggle/clear + DELETE
    (never in GET — a guest GET must not write). `section` = the top template's title on EVERY
    instantiation (plain or composed) so the fold header always exists. Rides the existing
    `/api/todos` end-to-end (authed handler, TABLE row, `todos` PATH_KEYS, useWrite/outbox,
    deferred-removal undo) — no new endpoint. The new board card `departure` (key, grid,
    `always`, spliced after `today` by `reconcile`) = `DepartureCard`: weather tip + folded
    instances (TodoSection `show='checklists' foldSections`) + `ActivityBring` + the
    key-door. Aujourd'hui/Demain became agglomerators (`foldAll`), « À faire » loose-only
    (`show='loose' picker='plain'`). Pre-0116 instances of plain templates can't be
    back-marked — they stay loose rows and clear naturally (accepted, noted in the migration).
60. F35 D6 ➖: checklist instances are ephemeral one-day rows (roll off next day) — not
    search-indexed by design; the TEMPLATES are reachable via Réglages ▸ À compléter.
61. F35 D16: `e2e/board-edit.spec.ts` « the departure card owns the checklists » (fold +
    split + instantiation POST + guest read-only) + the reconcile splice in
    `src/lib/boardCards.test.ts` + `splitTodos`/`expandSectioned` units in `src/lib/todos.test.ts`.
62. **Post-ship re-verify (2026-07-13)** — both fresh rows (F35 + the F6 défi) re-scored
    against code after the ~15 polish commits that followed the 07-10 audit (parity-
    before-sign-off is now the standing closing slice of every feature). **One real gap
    found + FIXED: F6×D6** — `SearchPage.tsx` read raw `habits` without the
    `kind !== 'defi'` filter every habit list applies (`visibleHabits` invariant), so the
    standing défi carrier surfaced as a searchable « habitude »; now filtered at the read.
    Two verdict-note corrections (no code change): **F35×D11** — `DepartureCard` does NOT
    use `useReportEmpty`; it's a `mode:'always'` card that always has content (door + tip),
    so there is no empty to report — correct by design, the old note misnamed the mechanism.
    **F35×D9** — the phone-overflow coverage is `scenes.spec.ts` (`departure` @ 390px
    docOverflow), not `screenshots.spec` `OVERFLOW_CASES`. Everything else on both rows
    holds: F35 D1 day-floor+sweep intact post-polish (todos.ts), D4 zero raw writes, D7
    guide card + `boardHelp.departure`, D16 board-edit suite survived the ea33baa fix;
    F6 défi D7 now carries all three channels (guide point 0 + `boardHelp.defi` + a
    `defi` tour step, commit 6d18b23), defiDeck confirmed lazy-only (type-only + dynamic
    imports), toddler défi tile writes the mark for a picked face as designed.
63. **UX fix-waves re-verify (2026-07-13, commits 6d9e18a→)** — the four-wave audit
    pass. **One cell was a stale verdict: F15×D4** — scored ✅ on 07-10 but
    `RecipeForm.save` was still a raw `api('recipes').catch(()=>{})` (no outbox, a
    4xx closed the scene as if saved); TRUE as of wave 1 (`useWrite` + err +
    dirty-guarded scrim dismiss). The same wave gave every remaining silent-failure
    path its `StatusMessage` (AddSheet ×7, ListEditPage, ContactForm, MemoAttach,
    outbox replay-drop notice via the toast's new message-only `notice` kind) —
    error *surfacing* isn't a matrix column, so no other cells move. Wave 4
    converged F6's form on the FormFooter primitive (Delete/Pause in the footer's
    left cluster, busy+err on both) — D1/D3 were already ✅, uniformity only.
    Wave 2's board findings and wave 3's toddler/a11y findings live outside the
    matrix's dimensions (board glance integrity, is-speaking feedback, aiError
    hold on non-parent lenses). Audit finding 12 (band 1-column @360px) verified
    STALE — `WG_PHONE_COL_MIN` (89bd7b4) had already fixed it; finding 20
    (SubTabs aria-controls) skipped as invasive per its own carve-out (19 call
    sites; tablist roles/roving-tabindex/arrows already correct).

64. **« Garder ma maisonnée » SHIPPED 2026-07-13 (F33, no new table)** — the demo-sandbox
    claim flow (the piece demo.ts always deferred). `POST /api/demo/claim`
    (`functions/api/demo/claim.ts`, `authed(…, 'operator')` + `worker/routes.ts` row +
    `SILENT_PATHS` — credential-only write, no polled cache): sandbox-operator-only
    (403 otherwise), signup-grade validation (same regex / 8-char floor / PBKDF2
    `hashPassword` / `LOGIN_PASSWORD` invite gate / 409 on an existing email), then ONE
    in-place `UPDATE operators SET email, password_hash` — the household id never moves, so
    every row survives; the response re-issues session cookies for the new email so the
    device stays signed in. **Sweep-skip verified against code:** the sweep + cap key
    SOLELY on the `operators.email LIKE 'demo-%@babillard.invalid'` pattern
    (`demoHousehold.ts` `SANDBOX_EMAIL_LIKE`, no column/flag), so a claimed row leaves the
    sweepable set structurally; `isSandboxEmail` (new pure mirror, used by the handler +
    `lib/demo.ts` client-side) is pinned by new `demoHousehold.test.ts` cases (claimed
    email never matches; legacy `demo@` singleton never matches). Client: `useSandbox()`
    reads the RFC-2606 email `auth/me` already exposes (no new flag), `SampleBanner`
    wears a claim face in a sandbox (own dismiss key, replaces — never stacks on — the
    sample face), `/garder` (`ClaimPage`) mirrors Signup's shell/fields + confirm field,
    `StatusMessage` errors, `useOnline` disable (online-only auth action ➖¹², like
    login/signup). Checklist ➖: no migration/entity (credential rewrite), no peek/search/
    voice/media (not content), toddler never sees it (audience gate), no guide card —
    the flow only exists inside a 24 h sandbox session and self-presents via the banner
    (a permanent guide card would advertise a surface real households can never reach).
    D16: `e2e/demo-claim.spec.ts` (banner face, POST fires, mismatch guard, non-sandbox
    bounce). FR-CA first + EN mirror (`t.claim`).
65. **Sandbox first-session guidance SHIPPED 2026-07-13 (F33, UI-only)** — the demo
    visitor's "here's what to try" path. NOT a new card: `WelcomeCard` (the board's ONE
    onboarding card) wears a **try-this face** in a sandbox (`useSandbox()`, footnote 64) —
    its setup checklist (add family / meals / pair a tablet) is nonsense for a seeded
    24 h throwaway, so the steps become five invitations tuned to the seed (cook mode,
    a routine, the liste, move a board card, leave a mot), each a deep link through the
    existing URL grammar (`/liste?plus=1`, `/board?edit=1`, `/board?plus=mot` —
    DISCOVERY.md; the `?edit=1` link doubles as the mouse mirror of the hold gesture).
    No completion tracking (calm — links, not a checklist to clear; calm-tenets green),
    same dismiss key, FeatureMap + tour replay retained, toddler lens never sees it
    (existing audience gate). FR-CA first + EN mirror (`t.welcome.demo*`). D16: the
    try-this test in `e2e/demo-claim.spec.ts` pins the face swap + the deep-link hrefs.

66. **Entretiens saisonniers SHIPPED 2026-08-25 (F2, mig 0119 — one column, no new
    table).** The yearly/seasonal-upkeep uniformization pass on `home_projects`
    'upkeep', closing the audited cut corners: (a) **overdue carry-forward** — a
    missed due date (recurring cycle or dated one-off) is derived on read
    (`functions/_lib/upkeep.ts` `upkeepStatus.overdueSince`, backwards walk via the
    new `recur.ts lastOccurrenceOnOrBefore`, 2-yr floor) and waits as a checkable
    Act row on « À faire » (`board.homeOverdue`, blocks `dayClear`) + the season
    card, wearing ONE muted « En attente depuis <date> » line — never a badge or
    « X jours de retard » count (calm). (b) **completion-relative recurrence** —
    `recur_from 'anchor'|'done'` (0119): « à partir de la dernière fois » re-anchors
    the cycle on `last_done_at`'s day; form checkbox mirrors ChoreForm's
    check+hint pattern. (c) **ONE expander** — `_lib/upkeep.ts`
    (`upkeepOccurrences`/`upkeepStatus`) replaced the four per-endpoint
    re-implementations (home-projects/board/month/year); calendars pass
    `includeDone` (a cell records the day). (d) **seasonal vocabulary** — form
    preset chips « Chaque printemps/été/automne/hiver/saison » compile to plain
    `{freq:'yearly'|'monthly/3'}` + a `season.ts nextSeasonAnchorDate` anchor (NO
    wire change; RecurPicker untouched — shared with EventForm); `SEASON_SEEDS`
    grew 3→10 curated FR-CA rituals (same match/dismiss machinery, still plain
    POSTs). (e) **capture** — new `upkeep` AI intent + `_lib/recurParse.ts` regex
    backstop (« chaque automne », « aux 3 mois »; whenparse stays date-only) →
    a normal upkeep row; `home_projects` joined `CLEANUP_TABLES` + the client
    re-route tiles. Deliberate ➖: **no overdue paint on the month/year grid** (a
    calendar cell is a fact of the day; the carry-forward lives on board + season
    card), and **due-today stays on « Aujourd'hui »** (already a checkable row
    there — À faire gets only the owed ones, no double-render). Guards:
    `upkeep.test.ts`, `recurParse.test.ts`, `recur.test.ts` backwards-helper cases,
    `boardModel.test.ts` (merge/pendingDone/dayClear), `season.test.ts` presets +
    `seasonUpkeepItems` (the ONE board-card/Réglages-glance selection),
    `e2e/upkeep-overdue.spec.ts` (renders + deferred-undo check + guest no-check).
    [F2×D1/D3/D16; sibling of ³]
    **+ « Reporter » (2026-08-25, mig 0120, same commit family):** postpone an
    owed/due entretien without checking — `snoozed_until` (one nullable column);
    `upkeepStatus` suppresses dueToday/overdueSince until the return day
    (`snoozedUntil` in the status; a snoozed past one-off's nextAt becomes the
    return day so it can't leak onto the season card), then the row simply
    returns — derived, no timer, no notification. PATCH gains
    `{id, snooze: 'week'|'cycle'|null}` ('cycle' = `nextCycleDay`, recurring
    only; complete clears the snooze so a stale « reporté » never mutes the
    next cycle). UI: two peek actions (« Reporter d'une semaine » / « Au
    prochain cycle », behind the detail door per the compact-rows rule, guest-
    hidden), « Reporté au <date> » sub-lines on the Réglages row + season card,
    the return day previews on « À venir » when it lands within the week.
    Guards: snooze suite in `upkeep.test.ts`, the postpone case in
    `e2e/upkeep-overdue.spec.ts`.

### Gold standard (Day 4 — filled 2026-07-10 from the completed matrix)

**Method:** a "gap-free" row has **zero ❌ and zero 🔶** (only ✅ / ➖). Twelve rows
qualify: **F1, F4, F7, F11, F16, F19, F21, F22, F24, F25, F27, F32** (F21 joined once
Wave O settled its last 🔶 to ➖, footnote 20; **F4, F22, F32 joined once the Wave D
D13 reconciliation confirmed migs 0086/0087 had already converged their
`colour`/`position` cells — 2026-07-10, footnotes 3/21/22**). But gap-free ≠
exemplary — F7
Photos / F11 Widget space / F27 Notre monde are clean largely by carrying many
_deliberate_ ➖ (simple or derived features with little surface to get wrong). The
**gold standard = gap-free AND rich** (many substantive ✅, ➖ only where a
dimension is deliberately N/A):

- **⭐ La liste (F19)** — the overall reference. Full CRUD + reorder, `useWrite`
  offline, realtime keys, searchable, `useDeferredRemoval` undo, empty states,
  attribution faces, voice on the quick-add, toddler lens, e2e, guide+help+tour.
  Its only ➖ are D2 peek (check-in-place, "tap the thing") and D14 media (a list
  item has no blob) — both deliberate. Copy its wiring for any new list entity.
- **Agenda (F1)** — the reference for a **timed/dated** entity: lifecycle roll-off,
  month/year/day/this-week reach, peek adapter, faces, e2e. ➖ only on D10 voice
  (structured date form) and D14 media (text/derived).
- **Business (F24)** & **Notes du cercle (F25)** — the reference for a **cercle
  content entity**: clean full CRUD, peek adapter (F24), media trio (both), search,
  offline, realtime, help. Recent code, schema-conventions-native — the cleanest
  templates for a new cercle sub-entity.

**Near-gold (one _opportunistic_ 🔶, otherwise exemplary):** **Recettes (F15)** —
only D14 🔶¹⁰ (parallel step-image arrays, DB-1 deferred); **Personnes (F21)** —
only D4 🔶²⁰ (the bulk-import batch bypasses `useWrite`). Both are otherwise
full-coverage reference features.

**Correction to the exploration's guesses (code-is-truth):** **Mots (F5)** and
**Voyage (F31)** were _wrongly_ nominated by the pre-audit exploration — the
completed matrix shows each carries **real ❌ gaps** (F5: D6 search + D8 toddler;
F31: D6 search) plus a D7 🔶. Neither is a gold standard; both are Wave targets.

- **Per-dimension reference implementation** (the file a fixer should copy from):
  - **D1 CRUD:** `functions/api/cercle.ts` + `CercleFormPage` (create/edit/delete
    - `RowActions`); reorder from La liste (`usePointerDnd`, migration 0078/0110).
  - **D2 peek:** `buildBusiness` / `buildPet` (`adapters.ts` L105/L153) — clean,
    recent, minimal adapters. ✅ confirmed present.
  - **D3 undo:** `Liste.tsx` / `MealPool.tsx` via `useDeferredRemoval` — ✅ confirmed
    (17 call sites total; these two are the canonical polled-list pattern).
  - **D4 offline:** `useWrite()` in `Liste.tsx` (queue → replay → idempotency).
  - **D5 realtime:** `PATH_KEYS` block for `list`/`meals` in `_lib/realtime.ts`.
  - **D6 search:** `SEARCH_INDEX` entry for `listItem` / `recipe` (`searchIndex.ts`).
  - **D7 discovery:** **Le cercle (F21)** — 12 `cercleHelp` keys + tour steps +
    guide `cercle` card + FAB (Appendix A, richest of any feature). ✅ confirmed.
  - **D8 toddler:** `ToddlerBoard` / `KidKitchen` / `CircleKidView` (the deliberate
    lens fold, footnote 48).
  - **D9 kiosk/mobile:** any `lib/boardCards` card + `Cluster`/`Rail` rows.
  - **D11 empty:** `EmptyState` (88 files) / `useReportEmpty` for a board card.
  - **D12 attribution:** events/todos/drawings show `Avatar` tint (soft member ref).
  - **D13 schema / D14 media:** Business (F24) & Notes cercle (F25) migrations —
    `colour`/`position`/`created_at` + the `media_kind`+`media_key` trio, native.
  - **D16 e2e:** `cercle-crud.spec` (create-and-POST group/business/carnet) is the
    happy-path template Wave E copies for the smoke-only gaps.

### Ranked gap list (Day 4 — finalized 2026-07-10)

> 🔴 user-visible gap · 🟡 hygiene/drift · 🟢 nice-to-have. Every entry cites its
> matrix cell + its target wave. **This is the complete, ordered backlog** — the
> matrix has zero ❌/🔶 not represented below. Ranking rule: 🔴 (a user can't find
> / can't do / can't reach a thing) before 🟡 (drift invisible to users) before 🟢.
> Within a tier, breadth (features affected) breaks ties.

**🔴 User-visible gaps — do first (Waves S, H, T, E):**

1. [x] 🔴 **F5/F6/F12/F13/F22/F31×D6** — six persistent-content entities were
       **unfindable from Recherche** (no `SEARCH_INDEX` entry): Mots (F5),
       Habitudes (F6), Plan des repas (F12), Idées de repas (F13), Groupes (F22),
       Voyage (F31). **DONE (Wave S) 2026-07-10** — all six now have a
       `SEARCH_INDEX` entry + SearchPage section (footnote 51); cells ❌→✅. (Dessins
       was already searchable via `drawingFields`; recipe-linked meals/ideas reach
       via the recipe — filtered `!recipe_id` so they never surface twice.)
2. [x] 🔴 **F5×D8 / F6×D8** — Mots & Habitudes rendered no toddler lens at all
       (Day 3): `MotsCard` wasn't pulled into `ToddlerBoard`; `HabitudesPage`/
       `HabitudesCard` imported no `useAudience`. **DONE (Wave T) 2026-07-10** — both
       now fold into `ToddlerBoard` as picture-first, read-aloud `BigTiles` sections
       (« Un mot pour toi » / « Mes habitudes »); cells ❌→✅ (footnote 52).
3. [x] 🔴 **F30×D7** — Jouer was fully undiscovered: no guide card, no « ? », no tour
       (footnote 16 — the only feature dark on all three channels). **DONE (Wave H)
       2026-07-10** — a « Jouer » point on the `routines` guide card (route `/jouer`)
       makes it discoverable in the guide + FeatureMap; ❌→✅ (footnote 53). « ? »/tour
       stay ➖ (a toddler surface — `HelpDot` hides for that audience).
4. [x] 🔴 **F29×D16** — mur de collants had no e2e at all. **DONE (Wave E) 2026-07-10** —
       `e2e/stickers.spec.ts` places a sticker (POST) via a completed routine and removes
       one from the wall (DELETE); ❌→✅ (footnote 54).

**🟡 Hygiene / drift — invisible to users, converge opportunistically (Waves U, O, D, H, E):**

5. [x] 🟡 **F5/F8/F17/F29/F31×D7** — guide-only: Mots, Dessins, Vide-frigo, Mur de
       collants, Voyage had a guide card but no « ? » on their live surface (footnote 15).
       **DONE (Wave H) 2026-07-10** — Mots got an in-place `BOARD_HELP` entry; Dessins/
       Collants got a `SceneHead card=` `HelpDot`; Vide-frigo a `HelpDot` on its sheet;
       Voyage already had one (verdict corrected). Cells 🔶→✅ (footnote 53).
6. [x] 🟡 **F6×D7** — habits had guide + `operatorHelp`; **verdict corrected (Wave H)
       2026-07-10** — `HabitudesPage` already carries a `SceneHead card="habits"`
       `HelpDot`, the on-surface « ? » the Day-3 audit undercounted. 🔶→✅ (footnote 53).
7. [x] 🟡 **F29×D3** — the sticker ✕ was a **raw DELETE** with no undo toast and no
       confirm on a polled list (footnote 46 — the one D3 misassignment). **DONE
       (Wave U) 2026-07-10** — wrapped in `useDeferredRemoval(STICKERS_KEY)`; 🔶→✅
       (footnote 55).
8. [x] 🟡 **F21×D4** — `FamilyImportPage.tsx` bulk import = **9 raw `api()` writes**,
       not offline-queued (footnote 20). **DONE (Wave O) 2026-07-10 → ➖ (by design)**:
       the merge is a dependent id-chain (person POST → its id feeds the link/pet/group
       writes) plus online-only R2 photo re-copies — a queued person write returns a
       `null` id, so `useWrite` would break the chain into a half-import. Legitimately an
       online interactive batch (share-link → progress bar → done). 🔶→➖ (footnote 20).
9. [x] 🟡 **F20×D4** — `ghost.ts` `patchGhost`/`deleteGhost` bypassed `useWrite`
       (footnote 19). **DONE (Wave O) 2026-07-10** — `GhostSection`'s four mutations
       (track/save/remove/add) now go through `write('ghost', …)`; the raw wrappers
       (+`GhostPatch`) deleted. 🔶→✅ (footnote 56).
10. [x] 🟡 **F3/F14/F23/F30/F32×D16** — smoke-rendered only, no happy-path spec.
        **DONE (Wave E) 2026-07-10** — todo/restants (`interactions.spec`), pet
        (`cercle-crud.spec`), jouer/voiture (`play-and-car.spec`); 🔶→✅ (footnote 54).
11. [x] 🟡 **F10×D9 / F18×D9** — SearchPage & CirculairesPage weren't in any phone
        -overflow sweep. **DONE (Wave E) 2026-07-10** — `/search` + `/liste/circulaires`
        added to `screenshots.spec` `OVERFLOW_CASES` (poll now checks `.scene__body`);
        🔶→✅ (footnote 54).
12. [x] ✅ **F22×D13 / F34×D13 / F26×D13** — `sort_order`/`sort`→`position`:
        contact_groups, members, carnets, home_pins. **DONE (mig 0086, already
        shipped)** — reconciled 2026-07-10; cells 🔶→✅ (footnote 21).
13. [x] ✅ **F2×D13 / F32×D13 / F26×D13** — `color`→`colour`: tasks,
        schedule_blocks, carnets, home_projects (+ household JSON-pref columns).
        **DONE (mig 0087, already shipped)** — reconciled 2026-07-10; cells 🔶→✅
        (footnote 3).
14. [x] ➖ **F4×D13** — `notes.dismissed_at` vs `deleted_at`. **Verdict: keep**
        (sanctioned bespoke soft-clear name, already commented in 0018 — like
        `carnets.archived_at`); cell 🔶→➖ (footnote 22). Not a churn target.
15. [ ] 🟡 **F26×D14 / F34×D14** — `care_log.media_json` parallel array +
        `members.avatar_kind`/`avatar_ref` dual-purpose deviate from the media trio
        (footnote 23). **→ Wave D.**
16. [ ] 🟡 **F15×D14 / F28×D14** — recipe step-image + routine card-audio/photo
        **parallel arrays** instead of the trio (footnote 10, DB-1 deferred). **→ Wave D.**

**🟢 Nice-to-have / superset-safe (Wave D / opportunistic):**

17. [x] 🟢 **D5 hygiene (F4/F9/F28/F33×D5)** — **DONE 2026-08-27.** Dead
        `capture-classify` dropped; the blob/AI-scratch set (`note-media`,
        `routine-card-photo`, `ask`, `place-import`, `guest/intake-media`,
        `guest/postbox-media`, `recipe-ocr`) silenced. **Verdict corrected on
        code-read for the other three**: `guest/postbox-submit`/`postbox`,
        `guest/intake-submit`/`intake` and `guest-links` all have REAL polled
        client keys (`['postbox']` PostboxReview, `['intake']` IntakeReview,
        `['guest-links']` operator/guest.tsx) — they got `PATH_KEYS` entries, not
        silence, so an open review screen refreshes when a relative drops a
        message. `realtime.test.ts` pins both sets.
        _(D5 adversarial re-verify 2026-07-10 — enumerated every `worker/routes.ts`
        write vs `PATH_KEYS`∪`SILENT_PATHS`: **`recipe-ocr` was the one omission this
        list had missed** — an `onRequestPost` returning `ok({text})` inline, same
        AI-scratch class as the already-silent `recipe-vision`/`recipe-image`, so it
        breaks the "AI-scratch endpoints broadcast nothing" invariant. `intake`'s
        PATCH accept/reject is the same harmless-superset class, NOT a wrong-key bug:
        its cercle merge runs client-side through the separate `/api/cercle*` writes,
        which already carry the right keys. `family-share` defaults to `[['board']]`
        **by design** (comment in `realtime.ts`). D5 correctness holds everywhere —
        the board default never loses a board-surface refresh.)_

**Total: 17 ranked entries — 4 🔴, 12 🟡, 1 🟢.** No matrix ❌/🔶 is unrepresented.

---

## Part 4 — Fix-waves (write on Day 4, execute Day 5+)

One wave = one dimension across all its gapped features, sized to one session.
Standing rules for every wave: **reuse the existing primitive** (extend, don't
fork); a new Réglages setting merges into an existing sub (C-15); mobile +
toddler friendly; rows via `Cluster`/`Rail`; push straight to `main`; update the
matrix cell + tick the box when done. **Sized 2026-07-10 (Day 4).** Suggested
order: 🔴 waves first (**S → T → H → E**), then 🟡 (**U → O**), then opportunistic
(**P → D**). Each wave header notes its ranked-entry #s and its size.

- [x] **Wave S — Search** _(entry 1; SHIPPED 2026-07-10)_. Added a `SEARCH_INDEX`
      entry + a SearchPage section for all six kinds (footnote 51).
  - [x] `habit` (F6) · [x] `mot` (F5) · [x] free-text `meal` (F12) · [x] `mealIdea`
        (F13) · [x] `group` (F22) · [x] `trip` (F31)
  - _Verified:_ `e2e/search.spec.ts` « Wave S » test seeds one of each kind and
    asserts its section heading + hit link (5/5 search specs green locally);
    typecheck + 1436 unit tests green.
- [x] **Wave T — Toddler lens** _(entry 2; SHIPPED 2026-07-10)_. The two real D8 gaps
      only — the rest of the tab-features already fold deliberately (footnote 48).
  - [x] **F5 Mots** — folded into `ToddlerBoard` as « Un mot pour toi »: the waiting
        mots as picture-first `BigTiles` (drawing/photo in the tile, voice memo plays
        the clip, text read aloud), sender-tinted, guest-hidden. (footnote 52)
  - [x] **F6 Habitudes** — folded into `ToddlerBoard` as « Mes habitudes »: the habits
        still asking today, read-aloud tiles carrying the parent `habitReading` line.
  - _Verified:_ `e2e/interactions.spec.ts` « Mes habitudes » renders a due habit tile +
    asserts a tap fires no write; both sections reuse the `BigTiles` grid (no
    hand-rolled flex → no 360px overflow); typecheck + 1436 unit tests green.
- [x] **Wave H — Help/tour/guide** _(entries 3, 5, 6; SHIPPED 2026-07-10)_. Merged into
      existing cards (no new card, no new registry); `helpRegistry` + `guideLinks` green.
  - [x] **F30 Jouer** (🔴, entry 3) — a « Jouer » **point on the `routines` guide card**
        (route `/jouer`), the guide launcher. « ? »/tour ➖ (toddler surface).
  - [x] Guide-only « ? » gaps (entry 5): **F5 Mots** → in-place `BOARD_HELP.mots` on the
        card; **F8 Dessins** + **F29 Collants** → `SceneHead card=` `HelpDot`; **F17
        Vide-frigo** → `HelpDot` on the sheet title; **F31 Voyage** → already had one.
  - [x] **F6 Habitudes** (entry 6) — `HabitudesPage` already has a `SceneHead card=`
        `HelpDot` (verdict correction; the board `<Link>` card can't host an armed help-title).
  - _Verified:_ `e2e/help.spec.ts` « Mots » arms the board « ? », taps the title, asserts
    the bubble + `card=mots` link (per-test mots override, no snapshot moves).
    typecheck + `helpRegistry`/`guideLinks` + 1436 unit tests green. (footnote 53)
  - _Don't touch:_ Carnets/L'auto turned out covered (Appendix A).
- [x] **Wave E — e2e** _(entries 4, 10, 11; SHIPPED 2026-07-10)_. Happy path only;
      extended sweeps, no new harness. `cercle-crud.spec` was the create-and-POST template.
  - [x] **F29 Collants** (🔴, entry 4) — `e2e/stickers.spec.ts`: a completed routine
        (calm off) places a sticker (POST), the wall removes one (DELETE).
  - [x] Smoke-only → happy path (entry 10): **F3 todos** (＋ POST `todos`), **F14
        ＋Restants** (＋ POST `meal-leftovers`), **F23 pet** (`/cercle/pet/new` POST
        `pets`), **F30 jouer** (find-it → « Bravo »), **F32 voiture** (POST `car-day`).
  - [x] Overflow sweep (entry 11): **`/search` + `/liste/circulaires`** added to
        `OVERFLOW_CASES` (poll now also checks `.scene__body`); 8/8 pass FR+EN @360/390.
  - _Verified:_ each new/changed spec passes locally; typecheck green. (footnote 54)
  - _Note:_ trust CI's E2E job for the full signal; specs run individually here.
- [x] **Wave U — Undo/confirm rebalance** _(entry 7; ~S — one file)_. **DONE 2026-07-10.**
  - [x] **F29** — wrapped the sticker ✕ (`StickerWallPage.tsx`) in
        `useDeferredRemoval(STICKERS_KEY)`: `removal.visible()` filters the wall rows so a
        removed cell hides at once, `removal.remove()` holds the DELETE behind the undo
        toast (msg `stickerWallRemoved`) and awaits a refetch before un-hiding. No more
        raw write (light, frequent, polled → undo toast). (footnote 55)
  - _Verified:_ e2e (`stickers.spec`) — ✕ hides the cell + surfaces the toast with **no**
    DELETE fired; undo restores it, still no write. typecheck + 1436 unit tests green.
- [x] **Wave O — Offline writes** _(entries 8, 9; ~S/M)_. **DONE 2026-07-10.**
  - [x] **F21** — **recorded ➖** (not converted): `FamilyImportPage.tsx`'s merge is a
        dependent id-chain (each person/pet/group POST's returned id feeds the following
        link/membership writes) plus online-only R2 photo re-copies. A queued write
        returns a `null` id under `useWrite`, so offline-queuing the batch would produce a
        broken half-import — worse than the current explicit online-only flow (share-link →
        progress bar → done). By-design online. (footnote 20)
  - [x] **F20** — `GhostSection`'s four mutations (`track`/`save`/`remove`/`add`) now call
        `write('ghost', { … , affectedKeys: [GHOSTS_KEY] })` instead of the raw
        `patchGhost`/`deleteGhost` wrappers, matching QuickAddPage's ghost-mute precedent;
        the now-dead wrappers + `GhostPatch` type deleted from `lib/ghost.ts` (kept
        read-only). (footnote 56)
  - _Verified:_ typecheck + 1436 unit tests green; `interactions.spec` ghost tests (add
    staple → PATCH, track candidate → PATCH) pass through the new `write()` path; knip
    shows no new dead exports (3 removed).
- [x] **Wave P — Peek verdicts** _(~XS — one cell)_. **DONE 2026-07-10 → ➖ (no-peek).**
      The one D2 ❌ was **F6 Habitudes**. Verdict: **record ➖, no `buildHabit` adapter**.
      The board `HabitudesCard` is a single `<BoardCard to="/board/habitudes">` — tapping
      it opens « Le point du jour » (`HabitudesPage`), where check-in/history/edit live;
      the individual habit rows aren't independently tappable, so there's no per-habit
      thing to peek — a sheet would be a redundant menu in front of the page. Recorded in
      `adapters.ts`'s "tap the thing, get the thing" NOTE beside `buildRoutine`/
      `buildRecipe`. Cell ❌→➖ (footnote 57). **D2 now has zero ❌.**
      **SUPERSEDED 2026-08-03**: the card's rows became tappable → `buildHabit` peek
      shipped (edit-accessibility ask); the ➖ is a ✅ now. See footnote 57's revision.
- [ ] **Wave D — Schema/media convergence (opportunistic only)** _(entries 12–17;
      never a churn-only wave)_. When another wave touches one of these tables, fold
      in its convergence. **Reconciled 2026-07-10: the two scalar-rename items below
      already shipped in migs 0086/0087 before this audit was written — the audit
      just hadn't caught up. What genuinely remains is opportunistic media-shape work + the SILENT_PATHS cleanup.**
  - [x] `sort_order`/`sort`→`position`: contact_groups, members, carnets, home_pins.
        **DONE — mig 0086.**
  - [x] `color`→`colour`: tasks, schedule_blocks, carnets, home_projects.
        **DONE — mig 0087.**
  - [x] `notes.dismissed_at`: **keep + commented** (sanctioned distinct semantic,
        like `carnets.archived_at`) — not a rename target.
  - [ ] media parallel arrays → trio. **Halved on inspection, 2026-08-28** — the four
        names are three different shapes, and two of them are correct as they stand:
        - **REAL, and the anti-pattern the item means — positional arrays indexed by
          another array's position.** `recipes.steps_images_json` is parallel to
          `steps_json` by index (there is already a `normalizeStepImages(json,
          steps.length)` guarding the two apart — evidence the fragility is real, not
          theoretical), and routine cards do the same twice over
          (`cards_narration_json[i]` + the `rcp_` card photos). Insert or reorder a step
          and every array has to be re-indexed in lockstep. This is what to converge.
        - ➖ `care_log.media_json` — **not parallel to anything.** It is a LIST of R2 keys
          (invoice + manual + photo on one entry). The `media_kind`/`media_key` trio is
          single-blob by definition, so "converging" it would delete the multi-document
          ability the carnet scene is built on. Keep.
        - ➖ `members.avatar_kind` / `avatar_ref` — **not a media key.** `avatar_ref`
          holds a hex COLOUR or an R2 key depending on `avatar_kind` (0001_init:46). It is
          a polymorphic discriminated pair that happens to share the trio's shape; renaming
          it to `media_key` would make it lie for the majority case. Keep.
        _(still opportunistic: fold it in when a wave already touches recipes or routines,
        never as a churn-only migration.)_
        **The write-path risk this item actually names — not the column shape — is now
        guarded structurally (2026-09-03).** The sync ops already lived in one place
        (`lib/parallelArray.ts`, unit-tested, in use by both editors since
        migration 0041/`ad976bd` — ten weeks before this entry called it unconverged);
        what was missing was enforcement that every writer used it. Three call sites had
        already re-implemented `alignSide` by hand (`rows.map(() => '')`); converged onto
        the shared helper, plus a new build-gating test,
        `src/lib/parallel-array-rule.test.ts` (sibling of `write-rule.test.ts`), that
        fails the build if a side-array setter is ever fed a hand-built array again, or
        if a new positional side array is added without joining its `SIDE_SETTERS` list.
        Verified red against both plants (a hand-rolled bypass, an unregistered new side
        array) before being trusted. The schema itself stays positional on purpose — see
        above — so this item stays open as a policy-deferred migration, not a live risk.
  - [x] `SILENT_PATHS` cleanup — **DONE 2026-08-27** (entry 17): dead
        `capture-classify` dropped, 7 blob/AI-scratch endpoints silenced, and the
        3 with real polled keys (`postbox`, `intake`, `guest-links`) mapped in
        `PATH_KEYS` instead. `realtime.test.ts` green (22 tests).

---

## Part 5 — Primitive extraction & the new-entity checklist

### Extraction rule

Propose a new shared primitive **only when the completed matrix shows ≥3 features
hand-rolling the same shape** (the 🔶 cells are the hunting ground). For each:
name the 3+ call sites, extend-or-extract decision, and — if extracted —
register it in `/dev/kit` (`src/pages/DevKit.tsx`) + `COMPONENTS.md`, or it's
invisible to the next session.

Candidates to watch for while auditing (not yet justified — need the 3-site proof):

- ❓ a shared "entity list section" (header + rows + empty + add) — Board `Act`/`Section` vs kitchen pools vs cercle `NotesList` may already be 3 shapes of one thing.
- ❓ a `useEntityCrud(queryKey, endpoint)` bundle (useWrite + useDeferredRemoval + invalidate wiring) if Day 1 shows the same 15-line block in 3+ features.
- ❓ (add here as the matrix fills)

### The new-entity checklist (canonical — seeded now, finalized last day)

Every future entity/feature walks this list top to bottom; a skipped line is a
recorded ➖ with a why, never silence. When finalized, fold a pointer into
`CLAUDE.md` and keep the canonical copy here.

**Schema & backend**

- Migration follows the schema conventions: `created_at`/`updated_at`/`deleted_at`, `position`, `colour`, media trio, DB-5 attribution pattern chosen consciously, JSON `NOT NULL` defaults, soft refs commented. Calm test stays green.
- Handler under `functions/api/` wrapped in `authed()` (+ `'operator'` scope if destructive) **and** a `TABLE` row in `worker/routes.ts`.
- `PATH_KEYS` entry in `functions/_lib/realtime.ts` (or `SILENT_PATHS` with a why) + `realtime.test.ts` still green.
- Idempotent writes ride the existing middleware (nothing to do — verify only).

**Frontend data**

- Shared query key in `src/lib/queryKeys.ts` (page-local keys stay local).
- Writes via `useWrite()`; polled-list deletes via `useDeferredRemoval`; heavy deletes via `useConfirm`.
- Reads via `api()` only.

**UX reach**

- Detail adapter in `adapters.ts` — or a ➖ verdict comment beside the others.
- `SEARCH_INDEX` entry (or ➖ for ephemeral kinds).
- `EmptyState` / `useReportEmpty` on every surface (board card never returns bare null).
- Toddler + simple lens treatment (or written ➖); kiosk glanceability (board card decision in `lib/boardCards`); mobile 360px no-overflow (`Cluster`/`Rail`).
- Voice on compose surfaces via `EditField`'s opt-in (or ➖ for structured forms).
- Attribution shown as faces, never counts (calm).
- Every action walks `ACTIONS.md` Part 5 (door from the Part-1 taxonomy, non-touch mirror, undo tier, ⚙-face placement) and lands a Part-2 matrix row in the same commit (D17).

**Discovery & i18n**

- Guide: merge into an existing card in `lib/guideContent.ts` (32-card ceiling) with Ouvrir/Régler/Essayer; « ? » help entries in the owning registry; tour step if it changes a main surface. Read `DISCOVERY.md`; orphan tests green.
- `i18n.ts` FR block in Québécois register (EN parity enforced by tsc).
- New Réglages setting stacks into an existing sub (C-15), never a new pill.

**Proof**

- One e2e happy-path spec (or extend a sweep spec).
- New shared primitive (if any) → DevKit + `COMPONENTS.md`.
- Add the feature as a row in this file's Part 1 and score it.

---

## Part 6 — The standing gold-standard gate (how every new feature stays gap-free)

Part 5's checklist is the **what**. This is the **when + how-enforced**, so a feature
can't quietly ship below the bar. It closes the two failure modes this audit itself
surfaced:

- **Silent regression** — a feature ships missing a dimension nobody scored (the ❌/🔶
  Days 1–4 found across the matrix).
- **Stale verdict** — a matrix cell drifts from code: an ✅ that quietly broke, or a 🔶
  whose fix already shipped. Both happened here — the **D13 × migs 0086/0087**
  reconciliation (🔶 that was already done) and the **D5 × `recipe-ocr`** omission (a
  list that read complete but wasn't). **A cell is a verdict, not a fact.**

### The bar (restated)

Gold standard = **gap-free** (every one of the 16 D-columns is ✅ or a justified ➖ —
zero ❌, zero 🔶) **AND rich** (substantive ✅ where the dimension applies, not gap-free
only by piling on deliberate ➖). A feature is "done" when its Part-1 row is gap-free;
any 🔶/❌ is either fixed or converted to a ➖-with-why **before** it ships — never left
as a silent TODO.

### What already self-enforces vs. what needs eyes

Lean on the guards that exist; spend review attention on the rest.

| Guard                                     | Dimensions                                                                                                        | The mechanism                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Red build catches drift**               | D5 · D13/calm · D15 · D9 · D16                                                                                    | `realtime.test.ts` pins `keysForPath`; `calm-tenets.test.ts` blocks streak/points/badge/push/inventory; `tsc` enforces `typeof FR` EN-parity; `add-sheet-overflow`/`layout-overflow`/`screenshots` sweep 360 px; the feature's own e2e spec |
| **Manual only — nothing fails the build** | D2 peek · D3 undo · D6 search · D7 guide · D8 toddler · D10 voice · D11 empty · D12 attribution · D14 media-shape | The Part 5 checklist walk + a reviewer reading the row                                                                                                                                                                                      |

**Rule of thumb: the manual-only nine are where features silently fall short** — they
compile and pass tests while missing a peek, an empty state, a toddler lens, or a guide
card. Score them explicitly, every time.

### The per-feature workflow

1. **Design against the checklist, not after.** Open Part 5 + the reuse table in
   `CLAUDE.md`; decide up front which of the 16 dimensions apply and which are a
   deliberate ➖ (with the why).
2. **Build by reusing the primitive** for each applicable dimension — the CLAUDE.md
   "Reach for these BEFORE hand-rolling" table maps dimension → primitive. A hand-rolled
   version of something that already has a primitive **is** the regression.
3. **Self-score the row.** Add the feature to Part 1 and fill all 16 matrix cells. A ➖
   needs a footnote; a 🔶/❌ is a blocker, not a note.
4. **Close every non-✅** — fix it, or downgrade to a justified ➖. Only then is it done.
5. **Cite the evidence.** For any non-obvious cell, name the migration / commit / file
   that proves it, so the next reader re-verifies in one hop. This is what keeps cells
   falsifiable instead of folklore.

### Anti-staleness (the discipline this whole audit exists to enforce)

- **Re-verify before you build on a cell.** When you touch a feature, re-check its row
  against current code. Today a stale 🔶 (D13, already fixed by 0086/0087) and an
  incomplete ✅-list (D5, missing `recipe-ocr`) surfaced **only** by reading code.
- **A resolved cell flips in the SAME commit that resolves it.** The D13 drift existed
  purely because 0086/0087 shipped without touching PARITY. Don't repeat that.
- **Opportunistic-only items (Wave D) are still recorded, never silently dropped** — an
  unmapped `SILENT_PATHS` endpoint is added to entry 17 the moment it's noticed, even if
  the fix waits for a table-touching wave.

### Definition of Done (paste into the feature's commit/PR body)

```
Gold-standard check (PARITY Part 6):
- Part-1 row added, all 16 cells scored (➖ = footnoted why; no bare 🔶/❌)
- Reused the primitive for every applicable dimension (no hand-rolled fork)
- Schema conventions + calm test green | authed() + routes.ts + PATH_KEYS/SILENT_PATHS
- useWrite / useDeferredRemoval / api() ; shared query key
- Peek adapter · search · empty · toddler+mobile+desktop · attribution-as-faces (or ➖ each)
- Guide card merged (32-ceiling) + help entries ; i18n Québécois register
- e2e happy-path ; any new primitive → DevKit + COMPONENTS.md
- Non-obvious cells cite the migration/commit that proves them
```

---

## Appendix A — D7 discovery coverage, per channel (audited 2026-07-10, re-verified 2026-08-26)

Exact per-feature mapping of the three discovery channels. Sources:
`src/lib/guideContent.ts` (**32** GUIDE cards), the 8 `*Help.ts` registries, **plus the
`SceneHead card=` / `HelpDot` channel** (see ᴰ), and `src/lib/tourContent.ts`
(**7** tours: essentials/board/kitchen/**maison**/routines/cercle/liste).

**Legend.** ✅ covered · 🔶 partial · ➖ deliberately not applicable (footnoted) ·
❌ a real gap. There is **no bare ❌ left in this table**, and that is the point:

- **➖ᵀ — no tour step, by design.** Tour coverage is deliberately narrow: a tour is a
  short walk through a *section's* main moves, not a per-feature obligation
  (`DISCOVERY.md` step 4 says a tour step is **optional**). 23 features carried a ❌
  here purely for not being in a 7-step walkthrough, which read as 23 pieces of debt
  the project never intended to owe — 36% of every gap in this file. Flipped to ➖ᵀ on
  2026-08-26. Adding a step is a product decision, never a box to tick.
- **➖ᵀᵒ — a toddler surface has no « ? ».** Help mode is a parent affordance; a
  pre-reader gets picture + audio instead (F29, F30).
- **ᴰ — reached by `SceneHead card=` (`HelpDot`), not by a `*Help.ts` registry.**
  Both are the « ? » channel. Counting only the registries is what made F6, F8, F17,
  F30 and F31 look dark; the Post-Wave-H note below said so on 2026-07-10, but the
  CELLS were never updated, so anyone counting symbols kept reading debt this file
  had already retracted in prose. Fixed 2026-08-26 — if you correct an audit, correct
  the cells, not just the paragraph under them.
- **🔶ᴳ — covered by a POINT inside a bigger guide card, not a card of its own.**
  The three left (F8 Dessins, F17 Vide-frigo, F29 Collants) are partial only in that
  sense, and the house rule says leave them: the guide is merge-first with a ~32-card
  ceiling that 34 cards have already passed. Splitting one out needs it to earn its
  own space — a 🔶 here is a deliberate resting state, not a to-do.
- **ᴺ — Notes moved out of Le cercle**, so its « ? » lives in `notesHelp`
  (`mode`/`search`); the old `cercle:notes` key no longer exists.

| Feature                | Guide card                            | « ? » help entries                                                                                                                    | Tour step                                  |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1 Agenda              | ✅ `set-agenda` (+`board` pt 2)       | ✅ add:`event`; board:`today`,`fil`,`upcoming`; operator:`schoolYear`                                                                 | ➖ᵀ                                         |
| F2 Corvées+Projets     | ✅ `set-chores`                       | ✅ add:`chore`,`chores-pick`; operator:`choreLedger`,`homeProjets`,`homeEntretien`                                                    | ➖ᵀ                                         |
| F3 Todos               | ✅ `todos`                            | ✅ add:`todo`; board:`todos`; operator:`todoTemplates`                                                                                | ➖ᵀ                                         |
| F4 Notes frigo         | ✅ `capture` pt 1                     | ✅ add:`note`                                                                                                                         | ✅ board:`add-note`                        |
| F5 Mots                | ✅ `mots`                             | ✅ board:`mots`                                                                                                                                    | ➖ᵀ                                         |
| F6 Habitudes           | ✅ `habits`                           | ✅ operator:`habits`; board:`defi` (DefiBlock); HabitudesPage `card="habits"`ᴰ                                                                | ➖ᵀ                                         |
| F7 Photos/cadre        | ✅ `screensaver` + `set-display`      | ✅ operator:`photos`,`ambient`,`display`                                                                                              | ➖ᵀ                                         |
| F8 Dessins galerie     | 🔶ᴳ via `mots` (alias `drawings`)     | ✅ DrawingGalleryPage `card="drawings"`ᴰ                                                                                                                                    | ➖ᵀ                                         |
| F9 Capture/AddSheet    | ✅ `capture`                          | ✅ the whole `addHelp` registry                                                                                                       | ✅ essentials:`add-fab`; board:`add-tiles` |
| F10 Recherche          | ✅ `board` pts 4–5 (alias `search`)   | ✅ `search` key in board/kitchen/liste/cercle/routines registries                                                                     | ✅ board:`search`                          |
| F11 Widget space       | ✅ `board-widgets`                    | ✅ operator:`boardLayout`                                                                                                             | ✅ board:`board-cards`                     |
| F12 Plan des repas     | ✅ `kitchen` pt 1                     | ✅ add:`meal`; kitchenTab:`meals`; operator:`mealSlots`                                                                               | ✅ kitchen:plan-week                       |
| F13 Idées de repas     | ✅ `kitchen` pt 9                     | ✅ add:`ideas`; kitchenTab:`ideas`                                                                                                    | ✅ kitchen:`add-week`                      |
| F14 Restants           | ✅ `kitchen` pt 8 (alias `leftovers`) | ✅ add:`leftovers`; kitchenTab:`leftovers`,`useSoon`; board:`toFinish`                                                                | ➖ᵀ                                         |
| F15 Recettes           | ✅ `recipes`                          | ✅ add:`recipe`,`cook`; kitchenTab:`recipes`,`recipesBook`,`collections`; operator:`recipeTags`,`recipePills`,`measureColors`,`voice` | ➖ᵀ                                         |
| F16 Garde-manger       | ✅ `kitchen` pt 2                     | ✅ add:`pantry`; kitchenTab:`pantry`,`low`                                                                                            | ✅ kitchen:running-low                     |
| F17 Vide-frigo         | 🔶ᴳ `kitchen` pt 3 only               | ✅ IdeasPage `card="kitchen"`ᴰ — folded into « Idées » on purpose, no dedicated key                                                                                            | ➖ᵀ                                         |
| F18 Circulaires        | ✅ `deals`                            | ✅ add:`flyer`; liste:`flyer`                                                                                                         | ➖ᵀ                                         |
| F19 La liste           | ✅ `liste`                            | ✅ add:`list-item`,`quick-add`,`share`,`auto-pick`,`shop`; liste:`quick`,`clear`                                                      | ✅ liste:`liste-add`,sort-aisle            |
| F20 Fantômes           | ✅ `ghost` (+`set-shopping`)          | ✅ operator:`ghost`                                                                                                                   | ➖ᵀ                                         |
| F21 Personnes/familles | ✅ `cercle` + `set-household`         | ✅ add:`person`,`family`,`connect`; cercle: 12 keys (`family`,`household`,`tree`,`links`,`birthdays`…)                                | ✅ cercle:`cercle-views`,links             |
| F22 Groupes            | ✅ `cercle` pt 8                      | ✅ add:`group`; cercle:`namedGroup`,`editGroup`,`deleteGroup`,`social`; operator:`cercleGroups`                                       | ➖ᵀ                                         |
| F23 Animaux            | ✅ `cercle` pt 1                      | ✅ add:`pet`                                                                                                                          | ➖ᵀ                                         |
| F24 Business           | ✅ `cercle` pt 11                     | ✅ add:`business`; cercle:`business`                                                                                                  | ➖ᵀ                                         |
| F25 Notes du cercle    | ✅ `cercle` pt 10                     | ✅ notes:`mode`,`search`ᴺ                                                                                                                     | ➖ᵀ                                         |
| F26 Carnets            | ✅ `carnets`                          | ✅ cercle:`carnets`                                                                                                                   | ➖ᵀ                                         |
| F27 Notre monde        | ✅ `cercle` pt 7                      | ✅ cercle:`monde`                                                                                                                     | ✅ cercle:`cercle-world`                   |
| F28 Routines           | ✅ `routines` + `set-chores`          | ✅ add:`routine`; routines:`card`; operator:`calm`                                                                                    | ✅ routines: 4 steps                       |
| F29 Mur de collants    | 🔶ᴳ `routines` pt 4 only              | ➖ᵀᵒ                                                                                                                                    | ➖ᵀ                                         |
| F30 Jouer              | ✅ `routines` pt (post-Wave-H)        | ➖ᵀᵒ                                                                                                                                    | ➖ᵀ                                         |
| F31 Voyage             | ✅ `voyage`                           | ✅ VoyagePage `card="voyage"`ᴰ                                                                                                             | ➖ᵀ                                         |
| F32 L'auto             | ✅ `auto` + `set-agenda`              | ✅ add:`ride`; operator:`cars`,`schedule`                                                                                             | ➖ᵀ                                         |
| F33 Partager/invités   | ✅ `share-access` + `set-devices`     | ✅ add:`share`; operator:`guest`                                                                                                      | ➖ᵀ                                         |
| F34 Réglages/appareils | ✅ `settings` + `set-*` cards         | ✅ the whole `operatorHelp` registry                                                                                                  | ➖ᵀ                                         |

**Reading (re-verified 2026-08-26, against code):** every feature now has a guide
card and a « ? » on its live surface. Nothing is dark. What changed since the Day-3
reading — all of it stale cells, not new work:

- **F5 Mots** — `boardHelp` carries a real `mots` key. Was ❌; verified ✅.
- **F6 Habitudes, F8 Dessins, F17 Vide-frigo, F31 Voyage** — all reached via ᴰ
  (`HabitudesPage card="habits"`, `DrawingGalleryPage card="drawings"`,
  `IdeasPage card="kitchen"`, `VoyagePage card="voyage"`). The prose below already
  said this; the cells hadn't caught up.
- **F25 Notes du cercle** — cited `cercle:notes`, a key that no longer exists (ᴺ).
- **F29 / F30** — toddler surfaces, ➖ᵀᵒ by design, not gaps.

Remaining genuine partials, both 🔶 and both about the GUIDE column, not help:
**F8 Dessins** (covered only via the `mots` card's `drawings` alias) and **F17
Vide-frigo** / **F29 Collants** (one guide point inside a bigger card). Merging is the
house rule (~32-card ceiling), so these are candidates to *leave alone* unless a card
is genuinely earning its own space.

Tour steps exist for F4, F9–F13, F16, F19, F21, F27, F28 — by design; see ➖ᵀ.

*Method note:* two of these cells were re-verified WRONG on the first pass, by
grepping the registries alone and by reading `voyage`/`dessin` matches that turned
out to be prose inside another entry's body. A key is a key only if it is a key.

> **Post-Wave-H update (2026-07-10):** all seven are ✅ now (matrix D7, footnote 53).
> The « ? » column above counted only the 7 help REGISTRIES; it undercounted the
> `SceneHead card=` **`HelpDot`** channel, so F6 Habitudes (`HabitudesPage`) and F31
> Voyage (`VoyagePage`) were never truly dark. F5 gained an in-place `BOARD_HELP` entry;
> F8/F29 gained a `HelpDot`; F17 gained one on its sheet; F30 gained a `routines` guide
> point (its « ? »/tour stay ➖ — a toddler surface).

---

_Created 2026-07-10 from a two-agent exploration sweep (entities/endpoints/pages ×
capability dimensions) + dry-run scoring. D7 column fully audited same day
(Appendix A). **Audit Day 1 run 2026-07-10** — columns D1/D4/D5/D13/D14 filled or
confirmed for all 34 rows (footnotes 17–26). D5 was already seeded and holds; D1
verified (ghost/car deliberate shapes are ✅, F33 mixed 🔶); D4 clean except the
FamilyImportPage import batch + ghost.ts (DayPlanPage/Board already migrated); D13
outliers are `color`/`sort_order`/`sort`/`dismissed_at`; D14 outliers are the known
recipe/routine parallel arrays + care_log.media_json + members avatar. _(Reconciled
2026-07-10: the `color`/`sort_order`/`sort` outliers were **already converged** by
migs 0087/0086 before this audit — those cells are ✅; `dismissed_at` is a sanctioned
➖. See footnotes 3/21/22 + Wave D.)_ **Audit Day 2
run 2026-07-10** — columns D6/D11/D12/D16 filled for all 34 rows (footnotes 27–42):
D11 is near-universal (only Vide-frigo ³⁶ + Jouer ³⁷ are deliberate ➖); D12 attribution
holds where content is member-authored (events/todos/drawings/schedule show faces) with
6 deliberate ➖ where the entity carries no member "who" by design; D6 found 5 real
search gaps (Mots, meals, ideas, groups, Voyage) and confirmed Dessins is searchable via
`drawingFields`; D16 **corrected two pre-seeded ❌** (F18 Circulaires is e2e-covered → ✅;
F32 L'auto is layout-smoke-rendered → 🔶) and flagged 5 smoke-only surfaces (todos, restants,
pet-create, jouer, voiture) as happy-path e2e gaps. **Audit Day 3 run 2026-07-10** — columns
D2/D3/D8/D9/D10/D15 filled for all 34 rows (footnotes 43–50), so **the 16-column matrix is now
complete (zero ❓)**. D2 peek + D10 voice are deliberate ➖ across the board (peek follows
"tap the thing, get the thing"; voice concentrates on the ＋ capture spine + memo/quick-add
surfaces); D15 register is uniformly Québécois → all ✅. D3 is correctly assigned everywhere
except the **F29 sticker ✕ raw delete (🔶** — no undo, no confirm, on a polled list). D8 found
two real gaps — **F5 Mots and F6 Habitudes render no toddler lens (❌)** — the rest ✅ or a
deliberate kid-view fold (➖); D9 is ✅ except **F10 Recherche / F18 Circulaires (🔶** — unswept
scenes, no board card). **Day 4 run 2026-07-10** — gold standard chosen (F19 La liste
the overall reference; F1/F24/F25 gap-free-and-rich; F15/F21 near-gold; the pre-audit
Mots/Voyage guesses **corrected** — both carry real ❌); ranked gap list finalized at
**17 entries (4 🔴, 12 🟡, 1 🟢)**, each mapped to a wave; Part 4's eight waves sized
into per-item checkbox lists with verify steps. Status: **planning phase COMPLETE
(Parts 1–4); next is Day 5+ — execute the fix-waves, one per session (suggested order
S→T→H→E, then U→O, then P→D), updating matrix cells as each ships.**_
