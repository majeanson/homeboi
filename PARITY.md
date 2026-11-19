# PARITY.md — the feature-parity checklist: every dimension, every door

What a feature must consider before it ships: the **dimensions** every feature is scored on
(D1–D17), the **doors** a user action may enter through, the **undo tiers**, and one
**checklist** for a new entity or a new action. Review #42 (2026-11-18) merged the old
`PARITY.md` (the feature × dimension audit) and `ACTIONS.md` (the action × door matrix) into
this file. Their filled matrices, fix-waves and footnoted verdicts are in git (`git log -- PARITY.md
ACTIONS.md`); the rules they produced are below.

- **The code is the truth.** A scored cell is a verdict from a moment: re-verify it in code before
  building on it, and record a resolved verdict in the commit that resolves it.
- **Calm overrides every dimension.** No score justifies counts, ranks, streaks, points, push or
  inventory quantities (`calm-tenets.test.ts` holds the structural ones).
- **Legend**: ✅ present, through the shared mechanism · ➖ deliberately absent, always with a
  one-line why (parity means *considered everywhere*, not *present everywhere*) · ❌ a gap with no
  verdict · 🔶 partial, or hand-rolled beside the shared mechanism (the worst state: it works, and
  drifts).

This is a checklist to COPY into a commit, so it carries bullets, not boxes: `- [ ]` means open
work repo-wide (STATE.md §2).

## The dimensions (score a feature on each: ✅, or ➖ with its why)

| # | Dimension | ✅ means | How to score it |
| --- | --- | --- | --- |
| D1 | CRUD | create / edit / delete / reorder wherever the user meets it, where sensible | the handler's methods; `RowActions`, edit routes, `usePointerDnd` in the pages |
| D2 | Detail peek | tapping a row/mention opens `useEntityDetail` with a real adapter (➖: recipe, routine — they navigate to their scene) | `components/detail/adapters.ts`, `DetailKind` (`detail-rule.test.ts`) |
| D3 | Undo vs confirm | a light delete defers, a heavy one confirms, per the tiers below | `useDeferredRemoval(` / `useConfirm` per delete site |
| D4 | Offline writes | user-content writes go through `useWrite()` | `write-rule.test.ts`; exemptions are its ALLOWED list |
| D5 | Realtime | the write path is in `keysForPath` with the right keys, or in `SILENT_PATHS` with a why | `functions/_lib/realtime.ts`, `realtime.test.ts`, `keysMirror.test.ts` |
| D6 | Search | a `SEARCH_INDEX` entry (➖ for ephemeral/derived things) | `src/lib/searchIndex.ts`, `searchLanding.test.ts` |
| D7 | Guide + « ? » + tour | a guide card merged into `lib/guideContent.ts` (merge-first ceiling), help in the owning registry or a `SceneHead card=`/`HelpDot`, a tour step if it changes a main surface | read `DISCOVERY.md` first; `helpRegistry.test.ts`, `guideLinks.test.ts` |
| D8 | Lenses | a deliberate toddler (picture-first) and simple (calmer) rendering, or ➖ | `useLens()` flags (`babillard/lens-flag`) |
| D9 | Kiosk · phone · desktop | glanceable on the wall (a board card decision in `lib/boardCards`), no overflow at 360 px, nothing touch-only | `Cluster`/`Rail`, the overflow e2e specs, the doors below |
| D10 | Voice | a compose surface takes voice (`EditField` opt-in, `VoiceButton`); ➖ for structured forms | the composer |
| D11 | Empty | every list/card renders `EmptyState`, a board card reports via `useReportEmpty` (never a bare `return null`) | `empty-rule.test.ts` |
| D12 | Who | « who » is captured with the right pattern (soft member ref · `author_member_id` · external `author_label`) and SHOWN as faces, never counts | the table's `*_by` columns, the UI |
| D13 | Schema | `colour`, `position`, `deleted_at`, JSON `NOT NULL` defaults, soft refs commented (forward rule; don't churn working tables) | CLAUDE.md « Migrations » |
| D14 | Media | the `media_kind` + `media_key` (+ `scene_key`) trio via `uploadMedia()`, the old blob freed on replace, R2 unset → controls hide | `parallel-array-rule.test.ts` |
| D15 | Words | Québécois register (souper, céduler, courriel); toddler strings speakable by TTS; the glossary's word | `glossary.test.ts` (EN parity is `tsc`) |
| D16 | e2e | at least one spec walks the happy path | `grep -l <feature> e2e/` |
| D17 | Doors | every action enters through a door below, has a non-touch path, and declares an undo tier | the door table + the undo tiers |

**The bar.** A feature is done when every dimension is ✅ or a justified ➖: zero ❌, zero 🔶, and
not gap-free only by piling up ➖. D3, D10 and D12 fail no build, so they are where features
silently fall short: score them explicitly, every time.

## The doors (D17: pick from this table, never invent a channel)

Inventing a channel is how the app once had five spellings of delete.

| # | Door | Owning primitive |
| --- | --- | --- |
| 1 | **Row tap**: the row's centre is the primary act (peek, check, expand, play) | `Act`, `CheckRow`, `ListRow` |
| 2 | **Check disc**: complete/toggle, a target distinct from the row body | `Act onCheck`, `CheckRow`, `CheckDisc` |
| 3 | **Row furniture ✏️/🗑** | `RowActions` (`readOnly` defaults to `isGuest()`) |
| 4 | **⋯ overflow**: a row's long tail, a section head, a page tool | `ActionMenu` (portaled, keyboard-walked) |
| 5 | **Swipe left → delete** (La liste, Ajout rapide only; always mirrored) | `useSwipeToDelete` + `SwipeDeletePane` |
| 6 | **Long-press** (a board card → edit mode; a Liste row → its scene). The toddler/simple lenses claim long-press for tap-to-hear: never give it a third meaning | `useLongPress` |
| 7 | **Drag**: reorder, move across zones, drop on a target. Its grip is focusable and ↑/↓ run the same move | `usePointerDnd` + `[data-dnd-grip]` (`dnd-mirror.test.ts`) |
| 8 | **Detail peek**: visible footer actions + the head ⋯, split explicitly per adapter | `useEntityDetail()`, `EntityDetailSheet` |
| 9 | **Section composer**: a ＋ in the section head opens the field focused | `SectionAdd` / `useSectionAdd()` |
| 10 | **＋ FAB sheet tile** (`?plus=<mode>`, `ADD_HELP` per tile) | `SECTION_MODES` in `lib/addSheet.tsx`, `AddSheet` |
| 11 | **Réglages sub**: the admin / screen-reader-grade mirror, `SUB_GOTO` linking back | `pages/Operator.tsx`, `lib/settingsNav.ts` |
| 12 | **Deep link** (`?edit= ?item= ?add= ?plus= ?tab/sub/lens/card/point/focus`) | the grammar is `DISCOVERY.md`'s |
| 13 | **⚙ Simple ↔ Avancé face**: the simple face reads (a row = content + one action), Avancé restores the furniture; it IS the non-touch door of a gesture-based simple face | `ModeToggle` + a `lib/surfaceMode` flag |

**Two standing rules.** Nothing is reachable only by a touch gesture: a swipe, long-press or drag
names its mouse + keyboard path (a ⚙ Avancé control, a peek action, a ⋯ item or Réglages) in a
code comment. And **a door that names a thing lands ON it** (`?focus=`, `?plus=`, `?add=1`, a form
route), not on the page that merely contains it (`e2e/journey-navigation.spec.ts`).

## The undo tiers (every destructive door declares one)

- **deferred** — `useDeferredRemoval`: for any list a poll can refill. It hides the row now and
  holds the write behind the undo toast; wire both `remove` and `visible`.
- **compensating** — `recordUndo` / `useCreateWithUndo`: an action that must show instantly (an
  add), undone by its inverse.
- **confirm** — `useConfirm`: heavy deletes (a series, a cascade, a freed R2 blob), and **anything
  raised from inside a sheet or a scene**. The message says what is lost.
- **none** — only with a recorded ➖.

**The surface decides the tier, not the entity.** The undo toast sits at z-index 40, a sheet at
156, a scene at 50–150, so an undo offered from inside a sheet or a full-screen scene cannot be
tapped. One entity legitimately has two tiers: a business defers from its row peek (page level)
and confirms from its edit form (inside a Modal). No grep can see which layer a `remove()` is
raised from, so this rule is read, not linted. `undoTier.test.ts` keeps the raw undo hook to a
short allow-list.

## The checklist (copy into the commit that adds an entity or an action)

A skipped line is a ➖ with its why, never silence.

**Schema & backend**
- Migration follows the schema conventions (CLAUDE.md « Migrations »); the calm test stays green;
  a new table joins the demo sweep inventory (`demoHousehold.test.ts`).
- Handler under `functions/api/` in `authed()` (+ `'operator'` if destructive) **and** a `TABLE`
  row in `worker/routes.ts`.
- `keysForPath` entry in `functions/_lib/realtime.ts`, or `SILENT_PATHS` with a why.

**Frontend data**
- A declared query key (`lib/queryKeys.ts`, or a file-level `const X_KEY`).
- Writes via `useWrite()`; reads via `api()`; an optimistic create sends `newRowId()`.

**Each action**
- A primary door from the table above, through its owning primitive.
- A non-touch mirror named in a comment if the door is a gesture.
- An undo tier, chosen by the surface it is raised from.
- Gating: guest (`isGuest()` only if it writes `/api/*`), the lenses, kiosk vs phone, operator
  scope, AI/R2 unset.
- On a two-faces surface: the reading face (≤ 1 act per row) or the Avancé face (furniture).
- Discovery: a ＋-sheet tile (`SECTION_MODES` + `ADD_HELP`) or a ➖; a « ? » entry; a guide card
  merge if it changes a main surface (`DISCOVERY.md`).

**Reach**
- D2 peek, D6 search, D11 empty, D8 lenses, D9 kiosk/phone/desktop, D10 voice, D12 faces: each ✅
  or a ➖ with its why.
- Guide, help and tour per `DISCOVERY.md`; Québécois FR copy; a new Réglages setting stacks into an
  existing pill.

**Proof**
- One e2e happy-path spec (or a sweep spec extended).
- A new shared primitive → a DevKit entry + `npm run components` (COMPONENTS.md is generated).
- A new primitive is extracted only when three features hand-roll the same shape; otherwise extend
  the one that exists.

## Definition of Done (paste into the commit body)

```
Parity (PARITY.md):
- D1–D17 scored: ✅ or ➖ with its why; no 🔶/❌ left
- Reused the primitive for every applicable dimension (no hand-rolled fork)
- Schema conventions + calm test | authed() + routes.ts + keysForPath/SILENT_PATHS
- useWrite / useDeferredRemoval / api() ; a declared query key
- Each action: a door from the table, a non-touch path, an undo tier by surface
- Peek · search · empty · lenses · kiosk+phone+desktop · faces (or ➖ each)
- Guide merged + help ; Québécois FR ; e2e happy path ; new primitive → DevKit
- Non-obvious verdicts cite the migration/commit that proves them
```
