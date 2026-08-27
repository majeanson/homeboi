# AUJOURD'HUI — the board (the main window): review & backlog

> ✅ **Effectively closed (2026-08-27).** Every P1/P2/P3 item below is done or
> verdict-closed except one, left open on purpose: the toddler tiles' 6-second arm
> (`ARM_MS`), an empirical question about a real child rather than a code judgement.
> Sections 1–4 remain a useful **current-state map** of the board. See
> [`STATE.md`](./STATE.md).

> The Aujourd'hui board (`/board`, the **Grille** view) is the app's **main window** —
> the thing a household sees all day on the wall tablet and reaches for on a phone. This
> document is the **current-state map + a prioritized backlog** to work on later. It was
> produced from a deep review (three parallel code audits) on 2026-06-23. Keep it living.
>
> Source of truth for the code: `src/pages/Board.tsx` (parent + toddler), the cards in
> `src/components/board/*`, the per-device layout store `src/lib/boardCards.ts`. Calm
> tenets are enforced by `functions/db/migrations/calm-tenets.test.ts`.

---

## 1. Concept / mental model

The board is built on a few orthogonal ideas. Keeping them clean is what keeps it calm.

- **Two glances** (the toggle): **Grille** = today/now · **Mois** = the calendar ahead.
- **Two presentation axes** (both contexts, both overridable by URL):
  - **Surface** — `kiosk` (wall, glanceable, shared) vs `mobile` (phone, personal). `lib/surface.ts`.
  - **Audience** — `parent` (reader, detail peeks) vs `toddler` (pre-reader, hear-first tiles). `lib/audience.ts`.
- **One lens** — the **face picker** (Maisonnée = everyone · a person = their items + shared). `lib/profile.ts` + `MemberSwitcher`. This _is_ "Par personne" — a filter, not a layout.
- **A two-tier visual system** (the colour decision):
  - **Hero cards** (washed backgrounds): « Ce soir » supper, weather/photo, « À régler ». The rich glance band on top.
  - **Section cards** (thin coloured **outline + icon**, neutral background): Aujourd'hui, À finir, À compléter, À venir, L'auto. The colour that _carries meaning_ lives on the **rows** (member / meal-slot / chore colours, all user-customizable) — so the cards stay calm and never rainbowy.
- **Per-device customization** — show/hide + reorder the section cards (`useBoardCards`, Réglages ▸ Affichage ▸ « Disposition du babillard »). A kiosk and a phone keep their own layout.
- **Calm tenets** — no streaks/points/badges/push/inventory, schema- _and_ UI-enforced.

---

## 2. Current-state inventory — cards & affordances

### Cards (parent Grille), top → bottom

| Card                                    | Renders when                      | Data                                                 | Key affordances                                                     |
| --------------------------------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| **DayHeroes** (`board/DayHeroes.tsx`)   | supper or weather exists          | `data.tonightMeals`, weather, wonder                 | tap a supper → detail peek; shuffle wonder                          |
| **ARegler** (`board/ARegler.tsx`)       | parent **mobile** + signals exist | `useARegler()` (derived `/api/a-regler`)             | tap → the fix (1) or « Cette semaine » (N)                          |
| **AutoCard** (`board/AutoCard.tsx`)     | a car / schedule / ride exists    | `useCarToday()`                                      | tap → `/voiture`                                                    |
| **Aujourd'hui** (`board/Fil.tsx` inside `today`) | always (`mode: always`)   | `data.today/choresToday/todos/todayMeals` + `data.work` | ONE card that owns the day. On a busy day (`filActive` = ≥2 timed things) its body renders **« Le fil du jour »** — events + L'auto rides + **work/job windows** on a time axis (gap-spaced, past dimmed, « maintenant » marker), **chores + all-day events** pooled under « À tout moment » — instead of the flat list; meals/home/pills stay, `Prochainement` hides. On a quiet day it's the plain agenda + « Prochainement » headline. Tap → peek; chore checks work. Toddler = `DayTimeline`. **The former standalone `Fil` card was merged in (2026-07-10) — no more "which of the two is which".** |
| **Demain** (own card)                   | hidden if empty (`hasTomorrow`)   | tomorrow's meals/events/todos | split out of « Aujourd'hui » into its own bento; cool sky tint |
| **À finir** (leftovers only)            | leftovers exist                   | `data.leftovers`                                     | check → deferred undo; tap → peek                                   |
| **À faire** (the ONE to-do card)        | always (add surface)              | `data.todos` (loose) + `TODOS_KEY` (TodoSection)     | UI merge of the two old todo cards (backends unchanged): loose one-off tasks up top, reusable checklists (« À compléter ») below via the embedded `TodoSection`'s own header — two labelled groups in one card. Help "?" on the title explains the distinction (`boardHelp` `todos` → guide). |
| **À venir**                             | any upcoming                      | `data.upcoming/choresUpcoming/homeUpcoming`          | tap → peek; « Bientôt » window                                      |
| **Drawings** (`board/Notes.tsx`)        | drawing notes exist               | `data.notes` (drawing)                               | tap → edit/zoom; « La galerie »                                     |
| **PhotoFrame** (`board/PhotoFrame.tsx`) | photos exist                      | `/api/photos`                                        | tap → zoom; shuffle                                                 |
| **Toddler: BigTiles**                   | `audience='toddler'`              | same data                                            | tap → hear; tap again → commit                                      |

### Cross-cutting affordances

- **Detail peek** — any `Act` row → `detail.open(buildEvent/buildChore/buildMeal/buildLeftover)` (`components/detail/*`). Parent only; the toddler lens is hear-first (no sheet).
- **Deferred-undo check-off** — `markChoreDone/markTodoDone/markHomeDone/markLeftoverDone`: hide the row at once (`pendingDone`/`pendingLeftover`), hold the write behind the undo toast, await a refetch before un-hiding (the live poll can't resurrect a just-checked row). Undo means the rotation never advanced.
- **Face lens** — `focusing = !!profileId`; `mineEvent`/`mineChore` keep my items + shared (unassigned) + my rotation teams; meals are never filtered (family table).
- **« Prochainement »** — the soonest still-to-come timed event today (30-min grace), a calm headline atop Aujourd'hui.
- **Cook / departure** — quick pills: « Préparer le repas · <meal> » (`useNextMeal` → cook) and « Avant de partir » (`/board/departure`).
- **Customization** — `useBoardCards()` (localStorage, `useSyncExternalStore`); board renders an inline keyed registry in `visibleCardOrder()`.

---

## 3. Quick-add / capture (the ＋ flow)

- **The ＋ FAB sheet** (`components/AddSheet.tsx`, modes in `lib/addSheet.tsx`). Board tiles
  (`SECTION_MODES.board`): `capture · event · chores-pick · todo · routine · plan-today ·
plan-tomorrow · departure`. Operator-grade tiles are hidden from a guest/unsigned kiosk
  (`OPERATOR_MODES`) → they get capture instead.
- **The capture spine** — type-or-speak → `POST /api/capture` → Workers AI
  (`functions/_lib/ai.ts`, llama-3.3-70b) classifies into `event/task/list-item/pantry-low/
meal/leftover/note` and `routeIntent` writes the row. AI unset/503 → `{type:'note',
degraded:true}` and the client shows a manual 7-type picker (capture is never lost).
- **The event form** (`components/forms/EventForm.tsx`) is now **ONE unified form**: a plain
  rendez-vous (title/date/time/who/recur/lead) + two **optional** collapsible sections —
  **« Trajet »** (car + passengers) and **« À apporter »** (bring-list: pick a saved list OR
  build one inline). The old separate « Trajet »/« Activité » ＋ tiles were folded in; the
  `?ride=1`/`?activity=1` deep-links remain (e.g. the L'auto card's quick « + trajet »).
- **Bring-lists** are `todo_templates` (`/api/todo-templates`), the same lists « Avant de
  partir » uses; the inline builder POSTs a new one named after the event and auto-selects it.

---

## 4. Strengths (keep these)

1. **Anti-addiction by construction** — no streak/points/badge/push tables (schema test), and the UI honours it (deferred undo, no confetti, calm done-colour, optional « Bientôt », faces-not-scores chore ledger).
2. **Calm hierarchy** — fixed hero band on top, masonry section cards below, inline time/title/who (one thought, not stacked), quiet counts, subtle colour (outline + icon, washes only on heroes).
3. **One face lens** absorbs "per person" without a separate layout; rotation teammates still see shared chores; meals stay the family table.
4. **Deferred undo** — a mis-tap costs nothing, and the refetch guard prevents flash-back.
5. **Dual audience in one tree, one dataset** — parent peeks + toddler hear-first tiles; no parallel upkeep; kiosk lock (`?kid=1`) + a math gate to exit.
6. **Offline tolerance** — polls, keeps the last good frame, flips a "showing cache" stamp instead of blanking; query cache persisted; offline writes queued.
7. **Per-device customization** — live (no reload), kiosk vs phone independent.

---

## 5. Gaps & risks — prioritized backlog (work on later)

### P1 — quick, high-value (mostly a11y + polish)

- [x] **Touch targets below 44px** — the check disc keeps its calm 30px visual but its **tap target is now 44px** via an invisible `::before` (`today.css` `.act .check::before`); the view-toggle bumped **32→40px** + 36→40px on phone (`board/views.css` `.boardview__opt`).
- [x] **« Prochainement » button aria-label** — added (was built from spans, no label). _(PhotoFrame/WonderBand shuffle buttons already have labels.)_
- [x] **`:focus-visible` on `.act`** rows — accent ring on `.act`/`.act__hit`/`.act__checkbtn` (+ `.boardview__opt`); pointer taps don't trigger it, so the calm look holds (`today.css`).
- [x] **Long-title overflow** — `.act .title` now `min-width:0; overflow-wrap:anywhere`, so a long/unbroken title wraps inside its box instead of shoving the time/who off the row.
- [x] **Drawing tap-to-edit / note-clear** affordances — every `Notes.tsx` control (edit ✏️ badge, keep, clear ✕, audio play, text card) now carries an `aria-label`; the drawing image is a labelled `ZoomableImg`. (Verified done.)

### P2 — needs a small design pass

- [~] **Contrast audit** — DONE for the dawn/dusk dark tiers Marc flagged: the **twilight** (purple) palette had `--ink-faint` time labels at **2.4:1** on its mid-tone `--card` — a clear AA fail. Fixed by darkening the twilight grounds a step (`#6a5c69→#564a57`, still distinctly lighter than deep-twilight so the day→twilight→deep-twilight→night ramp stays gradual) **and** lifting `--ink-faint`/`--line-strong` so small text clears 4.5:1 and the check disc reads; deep-twilight `--ink-faint` (was 3.0) bumped the same way (`core.css`). **Now done:** base-day `--ink-faint` darkened `#a99e8e→#7a7060` to clear AA on cream, AND `tintInk` is now **adaptive** (`lib/colors.ts`) — a bright member/slot colour is pulled harder toward `--ink` by its luminance (cap 62%), so a coloured `.act .title` stays ≥AA whatever face/slot colour it wears.
- [x] **Focus restoration on detail-sheet close** — `DetailProvider` captures the opener (`document.activeElement`) on `open` and returns focus to it on `close` (via rAF, if still connected), so keyboard/AT users land back on the row they peeked.
- [x] **Focus order in the masonry** — ✅ **ADDRESSED 2026-08-27 (landmarks, not a re-order).**
  The original diagnosis is out of date: the board stopped being CSS multi-column (which flows
  down column 1, then column 2 — genuinely scrambled against source order) and is now a JS-counted
  CSS **grid** flowing left-to-right. What remains is narrower and is documented at the source
  (`widget-grid.css`): `grid-auto-flow: row dense` can back-fill a hole with a **later** card, so
  visual order may depart from DOM order on a wide board. **Verdict: keep `dense`** — dropping it
  buys ragged holes on every wide board, and forcing order with `tabindex` is an anti-pattern. DOM
  order stays the household's own stored layout order, i.e. a meaningful sequence (WCAG 1.3.2) and
  a stable focus order (2.4.3). What was actually missing: each `.wg-slot` is a `<section>` with
  **no accessible name**, so it was not exposed as a landmark at all and the board reached AT as
  one undifferentiated run of controls. `CardSlot` now sets `aria-label={label}` → every visible
  card is a named **region**, so nobody has to tab the whole wall to reach one card. Guarded by
  `e2e/layout-overflow.spec.ts` (« board cards with no accessible name »).
- [x] **Landscape / very-narrow phone (320–667px)** — ✅ **DONE 2026-08-27 (tested; no fix needed).**
  The `columns: 300px` half of the premise is stale: the masonry became a JS-counted grid
  (`colsFor`, `lib/widgetGrid`) precisely so a card's size can be **clamped** against the column
  count instead of overflowing. `e2e/layout-overflow.spec.ts` now sweeps the board at **320 / 568 /
  667** px, asserting the resolved column count (1 / 2 / 2), zero horizontal overflow, and — measured
  per card, because a too-wide card is *clipped* rather than reported — that no card renders wider
  than the grid holding it. All green; no `@media` tweak was needed.

### P3 — bigger or judgement calls

- [x] **Two "todo" surfaces** — ✅ **RESOLVED (verified 2026-08-27).** They are ONE card now:
  `nodes.todos` renders « À faire » with the loose to-dos and embeds `TodoSection show="loose"`;
  the reusable checklists moved out to their own « Avant de partir » card (migration 0116). The
  "no UI hint which a household uses" premise is gone too — `boardHelp.todos` spells the split out
  in both languages (« des choses ponctuelles… tes listes qui reviennent vivent sur la carte
  “Avant de partir” »). The three-concept distinction still holds in the data model, as recorded
  in project memory [[babillard-two-todo-concepts]] — this was only ever a board-surface question.
- [x] **Very-wide kiosk** — ✅ **RESOLVED (verified + now guarded, 2026-08-27).** Stale premise:
  `.board-wall` has **no** max-width (it is deliberately full-bleed) and the masonry no longer
  "spreads across many columns" — `WidgetGrid` caps the count at `maxCols` (3 for the band, 4 for
  the grid), with `colMin` raised to 340px on a kiosk so cards stay readable across the room. The
  cap is now asserted at **2560px**, where an uncapped grid would ask for ~6 columns
  (`e2e/layout-overflow.spec.ts` `lo-board-w2560`).
- [ ] **BigTiles 6-second arm timeout** — may be short for a hesitant 2-year-old; test with real
  kids, consider 10s. _(Left open deliberately: this is an empirical question about a specific
  child, not a code judgement — both values are defensible and guessing would be pretending. The
  constant is `ARM_MS` in `components/BigTiles.tsx`, a one-line change once Marc has watched one
  real bedtime with it. Note the risk is bounded: on the toddler BOARD nothing commits at all, so
  the arm only governs the routine filmstrip and the défi tile.)_
- [x] **Untested intermediate widths** — ✅ **DONE 2026-08-27.** `e2e/layout-overflow.spec.ts`
  gained a deliberately narrow width axis (board only, parent only, FR only — five cases, not
  another full matrix): **320 · 568 · 667 · 1600 · 2560**. Each asserts the resolved column count,
  no horizontal overflow, no card wider than its grid, and that every visible card is a named
  region. The existing FORMATS×TABS sweep still owns the tab-by-tab coverage.

---

## 6. e2e coverage map

### Covered ✓

- Surface × audience × theme × format **frames** (`screenshots.spec.ts`) — board parent/toddler, day/night, phone(390)/wall(1280).
- **No-horizontal-overflow** guards @ phone (FR+EN, parent+toddler).
- **Custom card layout** renders (hidden + reordered prefs) — `screenshots.spec.ts` "board respects a custom card layout".
- Chore **check-off** PATCH (`interactions.spec.ts`), fridge-note **delete**, board **add-sheet** (`coverage.spec.ts`/`interactions.spec.ts`), supper-hero data render, crash/blank-surface guards.

### Gaps ❌ (backlog)

- [x] **« Disposition du babillard » panel** — `board-customize.spec.ts` toggles « À venir » off in Réglages ▸ Affichage and asserts the bento leaves the Grille, then Reset brings it back. (Drag-reorder still untested.)
- [x] **Unified event form** — ✅ **DONE 2026-08-27**, `e2e/event-form-bring.spec.ts` (4 cases),
  on top of the render-level assertions already in `screenshots.spec.ts`. « Créer la liste » POSTs
  the typed items to `todo-templates` **and selects the new list**, so the event's own POST carries
  `bringTemplateId` — the step the old coverage stopped short of, and the one whose failure looks
  completely normal on screen (chips present, button present, list silently unattached). Also:
  saving with the draft still typed creates the list on the way out rather than dropping it, a chip
  can be removed before creation, and « Prend l'auto » (there is no « Trajet » noun — one engagement
  model) reaches the POST as `carId`. The spec stubs the create's response id locally, since the
  shared harness answers every write with a bare `{ok:true}` and this is the one call that needs
  the id synchronously.
- [x] ~~**Moments chips**~~ — **moot (2026-08-25): « Moments » is retired.** `board-customize.spec.ts` now asserts an old `/moment` link redirects to the board instead.
- [x] **Face lens** — `board-customize.spec.ts` picks Papa and asserts the board re-renders: another member's event (Garderie / Léa) drops out while a shared row stays.
- [x] **Empty-state hiding** — ✅ **DONE 2026-08-27**, `e2e/board-empty-cards.spec.ts` (6 cases).
  Pins both directions of the `mode` contract: an `auto` card (« Demain », « À finir ») collapses
  when its data empties, an `always` card (« Aujourd'hui », « Avant de partir ») holds its place
  with the slot's placeholder on a completely fresh household. Two subtleties are asserted on
  purpose because they're what a "tidy-up" would break: (1) a collapsed slot is **hidden, not
  unmounted** — a self-fetching card can only learn it's empty *after* fetching, so unmounting
  would take the fetch with it and the card could never return; (2) « Demain » counts a **wide**
  net — tomorrow's forecast alone earns the card, so emptying only its events must NOT hide it.
  Same for « À venir », whose fêtes QC/CA are derived client-side rather than stored.
- [x] **Toddler board** — ✅ **DONE 2026-08-27**, `e2e/toddler-board.spec.ts` (4 cases). The
  assertion that matters is what a tap **doesn't** do: on the kid lens every board tile is
  hear-first (no `onTap`), so tapping « Sortir les poubelles » flashes `is-speaking`, never arms,
  and fires **no `/api/*` write at all** — a pre-reader's finger wanders across a wall tablet all
  day, and a board where a touch ticked a chore would quietly corrupt the household's day. (The
  two-tap arm is covered where the committable tiles actually live — the routine filmstrip, in
  `interactions.spec.ts`.) Plus the « Rien de prévu » all-clear, and its mirror: a bare day WITH
  weather is deliberately not all-clear, since `kidAllClear` is a wider check than the parent's
  `dayClear` (bmad/10). Getting there also documented what `fresh` does **not** empty in
  `e2e/mocks.ts` (objects survive `emptyArrays`) and removed an unreachable board-nulling branch.
- [x] ~~**Calendar → « Voir ce moment »**~~ — **moot (2026-08-25):** the calendar has ONE door now, « Voir la journée » → `/kitchen/day/:date`. `board-customize.spec.ts` covers the redirect; the day panel's single door is asserted in `month-day-panel.spec.ts`.
- [x] **`seedState` `cardPrefs` option** — already present in `e2e/mocks.ts` (`AppState.cardPrefs` → seeds `babillard-card-prefs`); the new layout test toggles via the real UI instead.

---

## 7. DevKit / COMPONENTS.md gaps

- **Registered + documented**: Act/Section/SubHead, MemberSwitcher, FaceSelect, TodoSection, BoardLayoutSection, WonderBand/useWonder.
- **Documented (page-level, correctly not in the live gallery)**: DayHeroes, ARegler, AutoCard, Notes, PhotoFrame, ActivityBring.
- **Gaps** (backlog):
  - [x] ~~**MomentPeek**~~ — **moot (2026-08-25):** the card was deleted with « Moments ».
  - [x] ~~**DayNote** — undocumented in COMPONENTS.md~~ — **stale (verified 2026-08-27):** it has
    its own row in COMPONENTS.md, beside `SkyTonight` in the board block.
  - [x] ~~**MomentsView**~~ — **moot (2026-08-25):** the view was deleted with « Moments »; `SkyTonight` was extracted to its own file, is documented, and is now in DevKit.

---

## 8. Responsive notes

- **Masonry** is CSS multi-column: `.board-grid { columns: 300px }` → 1 column on a phone, ~4 on a 1280 wall. Full-width bands (`.auto-card`, `.notes--drawings`, `.photo-frame`) use `column-span: all`.
- **Breakpoints**: `@media (max-width:680px)` tightens padding + gap; `.hub[data-surface='kiosk']` scales the greeting (`clamp(2rem, 4vw, 3.25rem)`) for across-the-room reading. `.board-wall` max-width 1500px.
- **Watch**: 520–680px (tablet transition, no intermediate rule), 1500px+ (ultra-wide), 320px (narrower than a column). No CSS-Grid fallback (degrades to a single block — safe, loses the wall effect). Multi-column **balancing** can leave staggered gaps when a tall section sits beside short ones.

---

## 9. Open questions / decisions for later

- Should card **colours** ever be user-customizable, or stay fixed-by-category? (Decided **fixed** for now — members/meals/chores already carry the customizable colour.)
- ~~Should the customizable set include the **hero band** (heroes / status) and **notes**?~~ **Decided (2026-06-24): yes — the set is now exhaustive.** « Disposition du babillard » groups the fixed top band — « Notes (frigo) », « Ce soir + météo », « À régler », « Moments » — as show/hide-only ("Bandeau du haut (position fixe)"), and the grid cards below as show/hide **+** reorder. Every board card a household sees now has a setting. (Tiny auto-hiding strips — DayNote, CercleBirthdays, WelcomeCard — are deliberately left out: they already vanish when empty.)
- Do we **merge** « À faire » + « À compléter » into one "things to do", or keep them distinct with clearer copy?
- ~~Should « Le fil du jour » be its own card, or part of « Aujourd'hui »?~~ **Decided (2026-07-10): part of « Aujourd'hui ».** The two cards read as near-duplicates (same events/chores, warm "today" tint, deduped so only one showed the events anyway). Folded the ribbon INTO the `today` card body — it renders when `filActive` (≥2 timed things), the flat agenda otherwise. The `'fil'` board-card id, its layout toggle, its `boardCard.fil` label and its `boardHelp` entry were removed; the toddler `DayTimeline` now rides the `today` card's visibility. ONE functional card.
- ~~Should « Moments » stay a separate windowed recap?~~ **Decided (2026-08-25): no — retired.**
  Its four windows all duplicated something: `tonight` ≈ the « Aujourd'hui » + « Ce soir »
  cards, `tomorrow` ≈ the « Demain » card, `date` ≈ the day page `/kitchen/day/:date` (which
  the ＋ « Planifier un repas » tile and the calendar already opened), and the sitter/handoff
  job ≈ `/board/departure` + the real sitter share link. The calendar's day panel carried two
  near-identical doors, « Voir la journée » and « Voir ce moment »; it now carries one. Same
  reasoning as « Le fil du jour » above: near-duplicates, ONE functional surface. Deleted:
  `MomentScene` / `MomentsView` / `MomentPeek`, the `moments` board card, `t.moment.*`, the
  guide point and the tour step; `/moment` lives on as a redirect to `/board`. Moved out
  first: `SkyTonight` → « Dehors aujourd'hui » (`SkySheet`), and the per-day « Avant de
  partir » door → the day page. **Knowingly given up:** the 7-day « Cette semaine » recap —
  nothing else renders seven day-blocks with their checklists. If it's missed, the cheapest
  revival is a « Semaine » face of Mois, not a new scene.
- Kiosk **column cap** on very wide walls — worth it?

---

## 10. What shipped in the pass that produced this doc

- Calm **outline+icon** card colour (fixed category palette; rows keep the meaningful colour).
- **Empty-card hiding** (Demain, À finir sub-groups) + **full-width add inputs**.
- **Per-device card customization** (show/hide + reorder; Réglages ▸ Affichage ▸ « Disposition du babillard »).
- **Event-form merge** — 3 ＋ tiles → 1 unified form with optional « Trajet » + « À apporter » + an **inline bring-list builder**.
- **Guide** notes for the above; the calendar « Voir ce moment » flow.

### Shipped in the follow-up pass (2026-06-24)

- **P1 a11y** (§5): check-disc 44px tap target (calm 30px visual kept), view-toggle 32→40px, `:focus-visible` rings on act rows + view toggle, long-title `overflow-wrap`.
- **Dawn/dusk contrast** (§5 P2): the **twilight** (purple) + **deep-twilight** palettes failed AA for the `.act .when` time labels — fixed (see §5 P2). The Moments scene reads on the dusk-violet ground now.
- **« À finir » redundant headings**: the two sub-headers (« Restants à finir » / « À faire ») now show **only when both groups are present** — a lone group no longer stacks a second near-synonymous title under the « À finir » card header. The card still hides entirely when both are empty.
- **e2e** (§6): new `board-customize.spec.ts` — Moments chips → scene scope, the « Disposition » toggle UI → card leaves/returns to the Grille, a fixed band card hide, and the face lens re-rendering the board.
- **Exhaustive card settings**: « Disposition du babillard » now covers **every** Grille card — the fixed top band (**Notes (frigo)** / Ce soir + météo / À régler / Moments) gained show/hide toggles (band stays fixed-position; grid cards still reorder). `lib/boardCards.ts` split into band vs grid (`BandCardId`/`GridCardId`, `isCardVisible`); `Board.tsx` gates each band card; the settings panel groups band-vs-grid with accurate hint copy.

### Shipped in the display/information pass (2026-06-24, pass 3)

- **« Le fil du jour »** (new): a calm day-ribbon — today's TIMED events read as a *shape*
  (time-ordered, gap-spaced for a soft time axis, past ones dimmed, a « maintenant » divider
  between past and upcoming), all-day items pooled under « À tout moment ». Rows reuse
  `eventAct` (tap → the same peek); pure layout in `lib/dayRibbon.placeFil` (+ test). A new
  optional grid card (`boardCards` `'fil'`, default before `today`); only with ≥2 timed events,
  and it hides the lone-next-up `Prochainement` while on screen. Toddler lens reuses the play
  space's `DayTimeline` (« Notre journée »). Registered in DevKit + COMPONENTS.md + Guide.
- **Weather micro-forecast strip**: `/api/weather` now fetches Open-Meteo `hourly` and returns
  a 3-step `hours` outlook; `DayHeroes` renders it as calm frosted icon+temp chips
  (`.now-card__hours`) on the weather hero. Degrades to null on partial payloads.
- **Base-day contrast** (§5 P2 — now DONE): base-day `--ink-faint` darkened `#a99e8e→#7a7060`
  to clear WCAG AA (4.5:1) on the cream `--card` for `.act .when` time labels + hints.
- **Wide-kiosk layout** (§9 column cap — now DONE): the masonry is capped to ~3 columns and
  centred on a kiosk (`max-width:1180px`) so a 4K wall stays a focused block, not a diffuse
  spread; a 600–900px two-column intermediate breakpoint added. (A fixed grid-template-areas
  "now-lane + rail" was set aside — it fights the per-device card reorder.)

### Shipped in the "think new" pass (2026-06-24, pass 4)

- **To-do merge** — the two surfaces folded into ONE « À faire » card (UI-only, backends kept):
  loose one-off tasks up top, the « À compléter » checklists below; « À finir » is leftovers-only.
  Help "?" on the title explains the distinction; Guide card retitled « À faire & à compléter ».
- **Parent « all-clear » hero** on a genuinely empty day; **« libre » gaps** in Le fil du jour.
- **Contextual help "?"** on EVERY board section card (Section is now help-aware).
- **a11y/contrast**: adaptive `tintInk` (bright colours clear AA) + detail-sheet focus restoration.
- **Time-aware emphasis** (`lib/momentFocus`): the board softly leans toward the moment
  (morning → day glance, afternoon → supper hero, evening → tomorrow prep). Under the ambient toggle.
- **« Living canvas »** (`lib/canvas` + `lib/season` + `BoardCanvas`): an ambient backdrop that
  drifts with season + weather (winter snow) + day-part. Per-device opt-out, reduced-motion-safe.

> Next session: remaining **P1** (Notes.tsx roles/labels), the **e2e gaps** still open (unified
> event form, empty-state hiding, toddler-board flow, drag-reorder; **add a `fil`-card
> frame**), and the remaining deferred contrast call (tintInk'd member-colour titles).
