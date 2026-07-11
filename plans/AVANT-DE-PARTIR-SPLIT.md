# Dissocier « À compléter » (todos) et « Avant de partir » (listes de départ / à apporter)

## Context

Two concepts are jumbled into one surface and one data shape:

- **General todos (« À compléter »)** — the `todos` table (mig 0046/0047), rendered by the shared
  `TodoSection` inside the board `todos` card, the tomorrow card, `DayPlanPage`, and `DeparturePage`.
- **Departure checklists / bring-lists (« Avant de partir » / « À apporter »)** — `todo_templates`
  instantiated via `POST /api/todos {templateId, day}` into plain todos rows, plus event bring-lists
  (`events.bring_template_id`, mig 0077) previewed only inside `/board/departure` (`ActivityBring`),
  whose « Ajouter à cocher » dumps items into the same todos list.

Result: an instantiated checklist is indistinguishable from a loose todo (a plain template's rows don't
even get a `section`), it clutters « À compléter », and it lingers past its day. The departure scene
embeds the same list, so "what to bring" IS the todo list.

**Marc's decisions:** (1) data-level split — mark checklist-instance rows, they leave « À compléter »;
(2) new board card « Avant de partir » — foldable checklist instances + today's bring previews +
key-door + weather tip; (3) departure checklists are ALWAYS day-pinned (no "global avant de partir")
and roll off after their day; (4) revise the four cards (Aujourd'hui, Demain, À faire, new card) into
coherent single-job roles; (5) walk PARITY.md Part 5/6 explicitly.

**Baseline:** the CURRENT on-disk working tree (another session has uncommitted in-flight changes in
`Board.tsx`, `boardCards.ts`, `TodoSection.tsx`, i18n, e2e mocks — be additive, never diff against HEAD;
re-check git state and stage explicit paths before each commit). Latest migration is 0115 → **new is 0116**.

---

## Design decisions

### D1. Schema — `source_template_id TEXT` soft ref (not `kind`)

`functions/db/migrations/0116_todo_source_template.sql`:

```sql
-- « Avant de partir » split: a todo instantiated from a todo_templates checklist is its
-- own concept — it leaves « À compléter » and lives on the departure card, day-pinned.
-- source_template_id: soft ref -> todo_templates.id (no FK: deleting a template must
-- never cascade instantiated rows). NULL = loose/manual todo; set = checklist-instance
-- row. The ref IS the discriminator; `section` (mig 0047) keeps the frozen DISPLAY
-- title (survives template rename/delete). Existing instantiated rows can't be
-- back-marked — they stay NULL / plain todos and clear naturally. Accepted.
ALTER TABLE todos ADD COLUMN source_template_id TEXT;
```

Why over `kind`: folding needs per-template grouping (the ref) anyway; a `kind` would be derivable drift.

- **Instantiation forces day-pinning:** `POST {templateId}` with `day` null → server defaults to today
  (`localDayStart`). Default, don't reject — the offline outbox replays queued POSTs; a 4xx would strand them.
- Instantiation now writes `section = root.title` for EVERY template (plain or composed — previously
  composed-only) so the fold header always exists. Change both `expandSectioned` copies in lockstep
  (`functions/api/todos.ts:199-205` and `src/lib/todos.ts:125-136`).

### D2. GET — one endpoint, client filters

`GET /api/todos` keeps returning all rows; `source_template_id` joins `COLS`/`TodoRow`/`Todo`. Both board
cards read the same `TODOS_KEY` cache and filter client-side (« À faire » = `source_template_id == null`;
« Avant de partir » = `!= null`; the glance's `day IS NULL OR day = today` WHERE already restricts
instances to today). One fetch, one offline cache, `setQueriesData` optimistic updates keep working. No
new query key; realtime `todos → [['todos'],['board'],['month']]` mapping already exists (verify
`realtime.test.ts` only). No `worker/routes.ts` change.

### D3. Roll-off — filter-on-read + opportunistic sweep on write

The glance WHERE already never returns a past-day instance. Add a sweep
(`DELETE … WHERE source_template_id IS NOT NULL AND day < ?today`) batched into `onRequestPost` (both
branches) and the `clearChecked` PATCH branch. **Not in GET** — a guest GET must not write. Tradeoff
(comment it): a past day page may show a stale instance until the next todos write — calm-acceptable.

### D4. TodoSection — parameterize, don't fork

Three additive props on `src/components/todos/TodoSection.tsx` (it already extracts `renderRow`), all
defaulting to today's behaviour:

- `show?: 'all' | 'loose' | 'checklists'` — filter on `source_template_id`, applied right after
  `removal.visible(...)`; default `'all'`.
- `foldSections?: boolean` — wrap each checklist group in the existing `Disclosure` + `useSingleOpen`
  (`src/components/Disclosure.tsx`): summary = section title + open-count chip, collapsed by default,
  one open at a time.
- `foldAll?: boolean` — ALSO wrap the loose group in a collapsed Disclosure (summary = `t.todos.title` +
  open count). This is the agglomerator mode for the Aujourd'hui/Demain embeds: everything present but
  folded, never taking the full view.
- `picker?: 'templates' | 'plain' | 'none'` — `'plain'` = text add only (`templatesQ` `enabled:false`,
  no options), keeps the « Pour aujourd'hui » secondary button; `'none'` = no add field at all (the
  Aujourd'hui/Demain agglomerator glances — adds live on « À faire » and the departure card).

Checklist grouping key = `source_template_id ?? section` (header text = `section`, fallback `t.todos.title`
for legacy rows). New pure helpers in `src/lib/todos.ts`: `isChecklistRow(t)` and `splitTodos(todos)` →
`{ loose, checklists: {key, section, todos}[] }` (first-seen order). Optimistic `tmpRow` gains
`source_template_id: null`.

---

## Card roles after the split (Marc's revision: Aujourd'hui/Demain stay AGGLOMERATORS)

1. **« Aujourd'hui » — the day's agglomerator: agenda + everything today, folded.** Keep ALL existing
   buttons as-is even if slightly redundant (Marc's call): the key `compactCorner` (`Board.tsx:933-936`),
   the grown-card `board-action--depart` button (`:990-996`), « Planifier », « Cuisiner ». ADD an
   agglomerated, space-cheap view of today's to-dos: embed `<TodoSection show='all' foldSections foldAll
   hideWhenEmpty picker='none'>` at the foot of the grown card — today's loose todos under one collapsed
   « À compléter » Disclosure (count in the summary) and each departure checklist instance under its own
   collapsed Disclosure. Collapsed by default so the agenda keeps the room; ticking inside syncs
   everywhere (same TODOS_KEY rows). Read-only-ish glance: no add field here (`picker='none'`) — adds
   live on « À faire » and the departure card.
2. **« Demain » — tomorrow's agglomerator.** Keeps `<TodoSection day={tomorrowTodoDay} hideWhenEmpty>`
   (`Board.tsx:1166`) with `show='all'` + `foldSections` + `foldAll` — tomorrow's loose todos AND
   tomorrow's checklists stay here, folded/collapsed by default so they don't take the full view. Keep
   « Planifier demain ». Tomorrow bring-previews on the new card: deliberately out of scope (the new
   card is a strictly-today glance) — recorded as a ➖.
3. **« À faire » — the to-do list home: loose todos, global AND by-day.** Embed becomes `<TodoSection
   show='loose' picker='plain'>` (`Board.tsx:1244`): checklist instances + the template picker leave
   (instantiation = departure concept now); plain add + « Pour aujourd'hui » secondary + the « En tout
   temps »/« Aujourd'hui » grouping ALL stay — todos remain global and day-pinnable exactly as today.
   Split `openTodos` (`Board.tsx:259`): `openLoose` feeds this card's `compactItems`/`compactHint`; the
   TOTAL keeps feeding `dayClear` so the all-clear hero can't contradict a pending departure list.
   **Label stays « À faire »**. Rewrite `boardHelp.ts` `todos` body (drop the "« À compléter » en
   dessous…" half; point at the departure card).
4. **« Avant de partir » (NEW `departure` card) — the departure concept's home, today.**
   (a) today's checklist instances, foldable + tickable + the template picker (the on-board
   instantiation home); (b) today's bring-lists via `ActivityBring` reused as-is; (c) key-door →
   `/board/departure` + the weather dressing tip — door+tip always render, so the card is never
   slot-empty (mode `'always'`). Redundancy with the today card's key button/corner is accepted
   (Marc: keep buttons as-is).

---

## Implementation steps

0. **Persist this plan in the repo** (Marc: "save a .md to execute later"): copy this file to
   `PlannerOrSomething/plans/AVANT-DE-PARTIR-SPLIT.md` (create `plans/` if absent) so any future session
   can execute it without this conversation.
1. **Migration** `0116_todo_source_template.sql` (D1); `npm run db:migrate:local`.
2. **API** `functions/api/todos.ts`: `COLS`/`TodoRow` + `source_template_id`; POST template branch pins
   day null→today, writes `source_template_id` + always-`section`; sweep (D3) in POST + `clearChecked`;
   header comment updated.
3. **lib** `src/lib/todos.ts`: `Todo.source_template_id` (commented soft ref), `isChecklistRow`,
   `splitTodos`, `expandSectioned` lockstep change.
4. **TodoSection** props per D4.
5. **New card** `src/components/board/DepartureCard.tsx` — self-contained card pattern (VoyageCard/
   HabitudesCard). Queries: `TODOS_KEY` (shared glance cache), `[...MONTH_KEY, today, today+1]` (same key
   DeparturePage uses) for bring events, `WEATHER_KEY` for the tip. Body: tip → `<TodoSection
   show='checklists' foldSections title={t.departure.lists} bento={false}/>` → `<ActivityBring events
   day={today}/>` → door row (`Cluster`). Mini: `compactItems` = open instance titles, `compactHint` =
   open count, nav to `/board/departure` when nothing to list. Never bare null; guest via TodoSection's
   `ro` path (door+tip stay — read-only nav is fine).
6. **Registry + Board**: `src/lib/boardCards.ts` — add `'departure'` to `BoardCardId` + `BOARD_CARDS`
   right after `today`: `{ id: 'departure', icon: 'key-bold', tint: 'var(--marigold-deep)', zone: 'grid',
   size: 1, mode: 'always', emptyTo: '/board/departure' }` (`reconcile` splices into saved layouts).
   `Board.tsx` — `nodes.departure`; card edits per the roles above: today card KEEPS its key corner +
   depart button and GAINS the folded agglomerator embed (`show='all' foldSections foldAll picker='none'
   hideWhenEmpty`); tomorrow's embed gains `foldSections foldAll`; todos card embed becomes
   `show='loose' picker='plain'`; `openTodos` split (`openLoose` vs total for `dayClear`).
   `ToddlerBoard` keeps the total open set (deliberate ➖, comment it).
7. **Styles**: append to `src/styles/todos.css`: `.todo-fold` summary styling + a small
   `.depart-card__tip`/`__door` block. `.departure__bring*` classes are already global — ActivityBring
   restyles for free. Never reorder `@import`s.
8. **i18n** (FR `src/i18n.ts` canonical + EN mirror `src/i18n.en.ts`, Québécois register):
   `boardCard.departure`, `departure.titleShort`, `departure.lists`, `departure.open`,
   `departure.emptyLists`; copy edit to the templates hint naming the new card. No Réglages change
   (C-15: templates editor stays Réglages ▸ À compléter).
9. **DeparturePage** (`:105`): embed becomes `show='checklists' foldSections title={t.departure.lists}`
   (picker stays `'templates'`; a `?day=` scene pins to that day — correct for a "demain" departure).
   Loose todos leave the scene (they live on « À faire »); update the `:102` comment.
10. **Help/Guide/DISCOVERY** (checklist DISCOVERY.md:114): `boardHelp.ts` — rewrite `todos`, add
    `departure` entry `{card:'board', point:<« Avant de partir » point index>}` wired via `helpKey`.
    `guideContent.ts` — merge, NO new guide card: update the board card's « Avant de partir » point
    (~:424), the « Listes de départ » FeatureMap tile (~:1198), the todos prose (~:1184), the Réglages
    editor point (~:2165). Run the `helpRegistry`/`guideLinks` graph tests.
11. **Sample data** `functions/_lib/sampleData.ts` (additive against in-flight state): seed templates
    « Avant de partir » + « Sac de soccer »; `bring_template_id` on a today event; one instantiated
    checklist for today (one row ticked) so the demo card shows alive.
12. **Docs**: `COMPONENTS.md` (TodoSection props, DepartureCard); `PARITY.md` Part 1 row + flip the
    todos-row cells in the same commit; paste Part 6 DoD into the commit body.

**Commit slicing** (push straight to `main`): (1) migration + API + lib + unit tests;
(2) TodoSection props + DepartureCard + Board/registry/styles/i18n; (3) help/guide/sampleData/e2e/PARITY/docs.

---

## PARITY Part 5/6 walk (self-score for the new row)

| Dimension | Verdict | Primitive / evidence |
|---|---|---|
| Schema conventions + calm | ✅ | mig 0116 soft-ref commented, no FK; calm-tenets green |
| authed()/routes/PATH_KEYS | ✅ | reuses `/api/todos` (existing authed handler + TABLE row + realtime mapping) |
| Offline / undo | ✅ | inherited: `useWrite`/`useCreateWithUndo`/`useDeferredRemoval(TODOS_KEY)` |
| Detail peek (D2) | ➖ | todo rows edit in place via `EditField` — same standing verdict as todos |
| Search (D6) | ➖ | instances are ephemeral day rows; templates reachable via Réglages |
| Empty (D11) | ✅ | door+tip always render (mode `always`); `EmptyState tone="calm"` for the lists |
| Toddler (D8) | ➖ | ToddlerBoard is a curated set; departure stays parent-facing (footnote) |
| Guest/demo | ✅ | `ro` hides picker/checks; card layout stays device-local (never `isGuest()`-gated) |
| Compact/mini | ✅ | Section compact lens (`compactItems`/`compactHint`) |
| Mobile/desktop/overflow | ✅ | `Cluster` door row; `Disclosure` folds are mouse+keyboard |
| Voice (D10) | ➖ | EditField add already carries the mic |
| Attribution (D12) | ✅ | face colours on rows, never counts |
| i18n (D15) | ✅ | `typeof FR` parity via tsc |
| Guide/help (D7) | ✅ | merged into existing board guide points + boardHelp (32-card ceiling respected) |
| e2e (D16) | ✅ | below |

## Tests

- **Unit:** `src/lib/todos.test.ts` — `splitTodos` grouping/order/fallback, `isChecklistRow`,
  `expandSectioned` always-title (plain + composed, lockstep with server). `src/lib/boardCards.test.ts`
  (in flight — extend): `reconcile` splices `'departure'` after `today` into saved v2 AND legacy v1
  layouts; default mode `always`. calm-tenets covers 0116 automatically; help/guide graph tests after
  step 10.
- **e2e:** `e2e/mocks.ts` — todos rows gain `source_template_id`, add instance rows + a `todo-templates`
  payload + one today event with `bring_template_id`. `board-compact.spec.ts` — the today-card key-corner
  assertion (`:72`) STAYS (buttons kept as-is); add `departure: 1` to the card-count map; assert « À
  faire » no longer contains instance rows; assert the today card shows the collapsed agglomerator
  Disclosures. `board-edit.spec.ts` — new id in reorder/hide sweeps; a happy-path block (fold opens,
  « Ajouter à cocher » POSTs `{templateId, day}`, door navigates); guest cases (card visible, no write
  controls).

## Verification

1. `npm run db:migrate:local` → 0116 applies clean.
2. `npm run typecheck` (EN parity) + `npm test`.
3. `npm run cf:dev` manual walk: instantiate from the card (day-pinned today, folded); tick + undo;
   « À faire » shows loose-only with plain add (global + « Pour aujourd'hui » both work); bring
   « Ajouter à cocher »; roll-off (backdate a row in local D1, next write sweeps it); DeparturePage shows
   checklists-only; Aujourd'hui + Demain agglomerate everything folded (collapsed by default, tick inside
   syncs everywhere); today's key corner/button still present; guest/demo read-only; mobile 360px no
   overflow.
4. Touched e2e specs locally if needed; CI is the baseline gate.
5. PARITY row gap-free; Part 6 DoD in the commit body; re-check git state before each commit (shared
   worktree), stage explicit paths, push to `main`.
