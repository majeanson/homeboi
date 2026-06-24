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
- **One lens** — the **face picker** (Maisonnée = everyone · a person = their items + shared). `lib/profile.ts` + `MemberSwitcher`. This *is* "Par personne" — a filter, not a layout.
- **A two-tier visual system** (the colour decision):
  - **Hero cards** (washed backgrounds): « Ce soir » supper, weather/photo, « À régler », « Moments ». The rich glance band on top.
  - **Section cards** (thin coloured **outline + icon**, neutral background): Aujourd'hui, À finir, À compléter, À venir, L'auto. The colour that *carries meaning* lives on the **rows** (member / meal-slot / chore colours, all user-customizable) — so the cards stay calm and never rainbowy.
- **Per-device customization** — show/hide + reorder the section cards (`useBoardCards`, Réglages ▸ Affichage ▸ « Disposition du babillard »). A kiosk and a phone keep their own layout.
- **Calm tenets** — no streaks/points/badges/push/inventory, schema- *and* UI-enforced.

---

## 2. Current-state inventory — cards & affordances

### Cards (parent Grille), top → bottom
| Card | Renders when | Data | Key affordances |
| --- | --- | --- | --- |
| **DayHeroes** (`board/DayHeroes.tsx`) | supper or weather exists | `data.tonightMeals`, weather, wonder | tap a supper → detail peek; shuffle wonder |
| **ARegler** (`board/ARegler.tsx`) | parent **mobile** + signals exist | `useARegler()` (derived `/api/a-regler`) | tap → the fix (1) or « Cette semaine » (N) |
| **MomentPeek** (`board/MomentPeek.tsx`) | parent board | `timeOfDay()` | 4 window chips → `/moment?scope=` (lead chip emphasized) |
| **AutoCard** (`board/AutoCard.tsx`) | a car / schedule / ride exists | `useCarToday()` | tap → `/voiture` |
| **Aujourd'hui + Demain** (bunched) | always (Demain hidden if empty) | `data.today/choresToday/todos/todayMeals` + tomorrow | « Prochainement » headline, cook/departure pills, rows → peek/check |
| **À finir** (leftovers + à faire) | leftovers OR todayTodos | `data.leftovers`, `data.todos` | check → deferred undo; tap → peek |
| **À compléter** (`todos/TodoSection`) | always (add surface) | `TODOS_KEY` | check in place, add, templates |
| **À venir** | any upcoming | `data.upcoming/choresUpcoming/homeUpcoming` | tap → peek; « Bientôt » window |
| **Drawings** (`board/Notes.tsx`) | drawing notes exist | `data.notes` (drawing) | tap → edit/zoom; « La galerie » |
| **PhotoFrame** (`board/PhotoFrame.tsx`) | photos exist | `/api/photos` | tap → zoom; shuffle |
| **Toddler: BigTiles** | `audience='toddler'` | same data | tap → hear; tap again → commit |

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
- [ ] **Touch targets below 44px**: the check disc is **30×30** and the view-toggle buttons **~32px** (WCAG AAA wants 44). Bump + adjust spacing. (`today.css` `.check`, `board.css` `.boardview__opt`.)
- [x] **« Prochainement » button aria-label** — added (was built from spans, no label). *(PhotoFrame/WonderBand shuffle buttons already have labels.)*
- [ ] **No `:focus-visible` on `.act`** rows — add `outline: 2px solid var(--accent)` so keyboard users see focus.
- [ ] **Long-title overflow** on `.act .title` — no `text-overflow: ellipsis`; a 30-char event can squeeze the time/who. Add ellipsis or a 2-line clamp.
- [ ] **Drawing tap-to-edit / note-clear** affordances lack clear roles/labels (`Notes.tsx`).

### P2 — needs a small design pass
- [ ] **Contrast audit** — `--ink-soft` (secondary) and `--ink-faint` (time labels) on `--card` may miss AA (4.5:1 / 3:1); and a bright user-chosen member colour `tintInk`'d onto a title can be low-contrast. Audit real values per theme.
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
- [ ] **« Disposition du babillard » panel** — the show/hide **toggle** + **drag-reorder** UI is never exercised (only the rendered result is). Add a test that toggles a card and asserts it leaves the board.
- [ ] **Unified event form** — assert « Trajet » + « À apporter » sections render, and the inline bring-list builder creates + selects a list.
- [ ] **Moments chips** — no test taps a window chip → `/moment?scope=`.
- [ ] **Face lens** — the profile picker sheet is tested, but not the board **re-render** under a picked face.
- [ ] **Empty-state hiding** — no test empties a section and asserts the card/sub-group vanishes (Demain, À finir).
- [ ] **Toddler board** — screenshot only; no interaction flow (tap-to-hear, all-clear).
- [ ] **Calendar → « Voir ce moment »** — no flow taps a Mois day and lands on Moments-by-date (incl. the today→tonight / tomorrow→tomorrow special cases).
- [ ] **`seedState` lacks a `cardPrefs` option** — tests inject `babillard-card-prefs` by hand; add it to `e2e/mocks.ts` for reuse.

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
- Should the customizable set include the **hero band** (heroes / status) and **notes**, or stay the grid cards only? (Currently grid-cards-only.)
- Do we **merge** « À faire » + « À compléter » into one "things to do", or keep them distinct with clearer copy?
- Kiosk **column cap** on very wide walls — worth it?

---

## 10. What shipped in the pass that produced this doc
- Calm **outline+icon** card colour (fixed category palette; rows keep the meaningful colour).
- **Empty-card hiding** (Demain, À finir sub-groups) + **full-width add inputs**.
- **Per-device card customization** (show/hide + reorder; Réglages ▸ Affichage ▸ « Disposition du babillard »).
- **Event-form merge** — 3 ＋ tiles → 1 unified form with optional « Trajet » + « À apporter » + an **inline bring-list builder**.
- **Guide** notes for the above; the calendar « Voir ce moment » flow.

> Next session: start at the **P1 backlog** (§5) and the **e2e gaps** (§6) — both are small, high-value, and make the main window measurably better.
