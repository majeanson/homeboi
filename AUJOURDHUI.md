# AUJOURD'HUI — the board (the main window): review & backlog

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
  - **Hero cards** (washed backgrounds): « Ce soir » supper, weather/photo, « À régler », « Moments ». The rich glance band on top.
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
| **MomentPeek** (`board/MomentPeek.tsx`) | parent board                      | `timeOfDay()`                                        | 4 window chips → `/moment?scope=` (lead chip emphasized)            |
| **AutoCard** (`board/AutoCard.tsx`)     | a car / schedule / ride exists    | `useCarToday()`                                      | tap → `/voiture`                                                    |
| **Fil** (`board/Fil.tsx`)               | ≥2 timed items today              | `todayEvents` (timed) + `data.work` + `todayChores` via `lib/dayRibbon` `placeFil` | « Le fil du jour » — the day as a shape: events + L'auto rides + **work/job windows** on a time axis (gap-spaced, past dimmed, « maintenant » marker); **chores + all-day events** pool under « À tout moment ». Tap → peek; chore checks work. Optional grid card `'fil'`. **Dedups « Aujourd'hui »** (carries its events + chores) + supersedes the lone-next-up `Prochainement`. Toddler = `DayTimeline`. |
| **Aujourd'hui + Demain** (bunched)      | always (Demain hidden if empty)   | `data.today/choresToday/todos/todayMeals` + tomorrow | « Prochainement » headline, cook/departure pills, rows → peek/check |
| **À finir** (leftovers + à faire)       | leftovers OR todayTodos           | `data.leftovers`, `data.todos`                       | check → deferred undo; tap → peek                                   |
| **À compléter** (`todos/TodoSection`)   | always (add surface)              | `TODOS_KEY`                                          | check in place, add, templates                                      |
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

- [x] **Touch targets below 44px** — the check disc keeps its calm 30px visual but its **tap target is now 44px** via an invisible `::before` (`today.css` `.act .check::before`); the view-toggle bumped **32→40px** + 36→40px on phone (`board.css` `.boardview__opt`).
- [x] **« Prochainement » button aria-label** — added (was built from spans, no label). _(PhotoFrame/WonderBand shuffle buttons already have labels.)_
- [x] **`:focus-visible` on `.act`** rows — accent ring on `.act`/`.act__hit`/`.act__checkbtn` (+ `.boardview__opt`); pointer taps don't trigger it, so the calm look holds (`today.css`).
- [x] **Long-title overflow** — `.act .title` now `min-width:0; overflow-wrap:anywhere`, so a long/unbroken title wraps inside its box instead of shoving the time/who off the row.
- [ ] **Drawing tap-to-edit / note-clear** affordances lack clear roles/labels (`Notes.tsx`).

### P2 — needs a small design pass

- [~] **Contrast audit** — DONE for the dawn/dusk dark tiers Marc flagged: the **twilight** (purple) palette had `--ink-faint` time labels at **2.4:1** on its mid-tone `--card` — a clear AA fail. Fixed by darkening the twilight grounds a step (`#6a5c69→#564a57`, still distinctly lighter than deep-twilight so the day→twilight→deep-twilight→night ramp stays gradual) **and** lifting `--ink-faint`/`--line-strong` so small text clears 4.5:1 and the check disc reads; deep-twilight `--ink-faint` (was 3.0) bumped the same way (`core.css`). **Still open:** the base **day** palette `--ink-faint` (#a99e8e) on cream is ~2.8:1 — the always-on look; changing it is a broader palette decision, deferred. And the bright-member-colour `tintInk`'d title case is unaudited.
- [ ] **Focus restoration on detail-sheet close** — focus isn't returned to the row that opened the peek; track a ref in the detail API.
- [ ] **Focus order in the masonry** — tab order is source order, not visual; on a wide kiosk that can jump columns. Consider a roving/landmark structure or accept it (document).
- [ ] **Landscape / very-narrow phone (320–667px)** — heroes may stack and `columns:300px` is wider than a 320px screen minus padding; test + a `@media` tweak.

### P3 — bigger or judgement calls

- [ ] **Two "todo" surfaces** — « À faire » (loose `data.todos`) vs « À compléter » (`todo_templates`-backed `TodoSection`) read similarly and both can appear; no UI hint which a household uses. Consider clarifying copy or merging. (See project memory [[babillard-two-todo-concepts]].)
- [ ] **Very-wide kiosk** — `.board-wall` max-width is 1500px but on a 4K wall the masonry spreads across many columns and the glance gets diffuse. Consider capping column count or `max-width` for kiosk.
- [ ] **BigTiles 6-second arm timeout** — may be short for a hesitant 2-year-old; test with real kids, consider 10s.
- [ ] **Untested intermediate widths** — 520–680px (tablet transition) + 1500px+ ultra-wide have no e2e frame.

---

## 6. e2e coverage map

### Covered ✓

- Surface × audience × theme × format **frames** (`screenshots.spec.ts`) — board parent/toddler, day/night, phone(390)/wall(1280).
- **No-horizontal-overflow** guards @ phone (FR+EN, parent+toddler).
- **Custom card layout** renders (hidden + reordered prefs) — `screenshots.spec.ts` "board respects a custom card layout".
- Chore **check-off** PATCH (`interactions.spec.ts`), fridge-note **delete**, board **add-sheet** (`coverage.spec.ts`/`interactions.spec.ts`), supper-hero data render, crash/blank-surface guards.

### Gaps ❌ (backlog)

- [x] **« Disposition du babillard » panel** — `board-customize.spec.ts` toggles « À venir » off in Réglages ▸ Affichage and asserts the bento leaves the Grille, then Reset brings it back. (Drag-reorder still untested.)
- [ ] **Unified event form** — assert « Trajet » + « À apporter » sections render, and the inline bring-list builder creates + selects a list.
- [x] **Moments chips** — `board-customize.spec.ts` taps a board Moments window chip → asserts `/moment?scope=week` + the scene's scope selector reflects it.
- [x] **Face lens** — `board-customize.spec.ts` picks Papa and asserts the board re-renders: another member's event (Garderie / Léa) drops out while a shared row stays.
- [ ] **Empty-state hiding** — no test empties a section and asserts the card/sub-group vanishes (Demain, À finir).
- [ ] **Toddler board** — screenshot only; no interaction flow (tap-to-hear, all-clear).
- [ ] **Calendar → « Voir ce moment »** — no flow taps a Mois day and lands on Moments-by-date (incl. the today→tonight / tomorrow→tomorrow special cases).
- [x] **`seedState` `cardPrefs` option** — already present in `e2e/mocks.ts` (`AppState.cardPrefs` → seeds `babillard-card-prefs`); the new layout test toggles via the real UI instead.

---

## 7. DevKit / COMPONENTS.md gaps

- **Registered + documented**: Act/Section/SubHead, MemberSwitcher, FaceSelect, TodoSection, BoardLayoutSection, WonderBand/useWonder.
- **Documented (page-level, correctly not in the live gallery)**: DayHeroes, ARegler, AutoCard, Notes, PhotoFrame, ActivityBring.
- **Gaps** (backlog):
  - [ ] **MomentPeek** — a real board card, **not in DevKit and not in COMPONENTS.md**. Document it (and consider a gallery entry — it's self-contained).
  - [ ] **DayNote** — undocumented in COMPONENTS.md (small, but should be listed).
  - [ ] **MomentsView** — only its `SkyTonight` sub-component is documented; the parent view isn't catalogued.

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

> Next session: remaining **P1** (Notes.tsx roles/labels), the **e2e gaps** still open (unified
> event form, empty-state hiding, toddler-board flow, calendar→Moments, drag-reorder; **add a
> `fil`-card frame**), and the remaining deferred contrast call (tintInk'd member-colour titles).
