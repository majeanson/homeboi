# ACTIONS.md — action reachability: every action, every door

> Companion to `PARITY.md` (cross-cutting **uniformity** — its **D17** points here),
> `DISCOVERY.md` (**comprehension** ↔ action), `LEAN.md` (**chrome** before content)
> and `bmad/11-friction-audit.md` (**flow** friction). This doc audits **doors**:
> which user actions exist on each surface, which entry points reach each one, and
> whether every action honours the two standing rules — *nothing reachable only by a
> touch gesture* (CLAUDE.md § desktop-reachability) and *every destructive tap has a
> considered undo tier* (`lib/confirm.tsx:6-10`).

⚠ **The code is the truth.** Every cell below is a **verdict recorded 2026-08-26**,
not a fact — re-verify against code before relying on it, and flip a cell in the
same commit that resolves it (PARITY's anti-staleness rule applies verbatim).

**Legend** (PARITY's, unchanged): ✅ present through the shared mechanism · ➖
deliberately absent (first-class, always with a why) · ❌ gap, no recorded verdict ·
🔶 partial / hand-rolled beside the shared mechanism · ❓ not audited.
**Gating superscripts:** ᴳ hidden from guest (writes `/api/*`) · ᵀᵒ toddler/simple
lens drops it · ᴷ kiosk-only / ᴹ mobile-only · ᴼ operator-only · ᴿ hides when R2
unset · ᴬ hides when AI unset · ᴸ touch gesture whose non-touch mirror is behind the
⚙ Avancé face (that mirror is the gesture's *reason to exist* — `lib/listeMode.ts`).

---

## Part 1 — The door taxonomy (canonical entry-point channels)

Every action on every surface enters through one or more of these. **When adding an
action, pick doors from this table — never invent a new channel** (that's how we got
five spellings of delete).

| # | Door | Owning primitive | Where |
| --- | --- | --- | --- |
| 1 | **Row tap** (the row's centre is the primary act: open peek, check, expand, play) | `Act` / `CheckRow` / `ListRow` / row `onClick` | `components/board/Act.tsx`, `components/CheckRow.tsx` |
| 2 | **Check disc** (complete/toggle, distinct target from the row body) | `Act onCheck`, `CheckRow` | same |
| 3 | **Row furniture ✏️/🗑** | **`RowActions`** — THE pair, 28 call sites, `readOnly` defaults to `isGuest()` | `components/RowActions.tsx` |
| 4 | **⋯ overflow** — three altitudes: row long-tail (meal rows), section head (cercle groups), page tool (Liste « Allées ») | **`ActionMenu`** (portaled, keyboard-walked, `checked`/`radio` rows) | `components/ActionMenu.tsx` |
| 5 | **Swipe left → delete** | `useSwipeToDelete` — 2 sites only (Liste, QuickAdd), always mirrored | `lib/useSwipeToDelete.ts` |
| 6 | **Long-press** | `useLongPress` — 2 sites only (board card → edit mode; Liste row → item scene). ⚠ the toddler/simple lenses claim long-press globally for tap-to-hear (`lib/tapToHear.ts`) — never add a third meaning there | `lib/useLongPress.ts` |
| 7 | **Drag** (reorder / move across zones / drop-on-target) | `usePointerDnd` + `[data-dnd-grip]` | `lib/dnd.tsx` |
| 8 | **Detail peek** — visible footer actions + head-⋯ `overflow: true` actions, split **explicitly per adapter, no heuristics** | `useEntityDetail()` + `detail/adapters.ts` (12 builders) + `EntityDetailSheet` | `components/detail/*` |
| 9 | **Section composer** — a ＋ in the section head that opens the field focused | `SectionAdd` + `useSectionAdd()`; always-open composers are the LEAN exception (Liste, Notes) | `components/SectionAdd.tsx` |
| 10 | **＋ FAB sheet tile** | `SECTION_MODES` per hub section, `?plus=<mode>` deep link, `ADD_HELP` per tile | `lib/addSheet.tsx`, `components/AddSheet.tsx` |
| 11 | **Réglages sub** — the admin/SR-grade mirror, `SUB_GOTO` linking back | `pages/Operator.tsx`, `lib/settingsNav.ts` |
| 12 | **Deep link** — `?edit= ?item= ?add= ?plus= ?tab/sub/lens/card/point/focus` | `DISCOVERY.md` owns the grammar |
| 13 | **⚙ Simple ↔ Avancé face** — the default face reads/does (row = content + one action); Avancé restores the managing furniture. **This toggle IS the non-touch door** for a surface whose simple face relies on a gesture | **`ModeToggle`** + a `createDeviceStore` flag (`lib/notesMode.ts`, `lib/listeMode.ts`) | `components/ModeToggle.tsx` |
| 14 | **Undo tier** (every destructive door declares one): **deferred** `useDeferredRemoval` (live-polled lists) · **compensating** `recordUndo`/`useCreateWithUndo` (must-show-instantly) · **confirm** `useConfirm` (heavy: series, cascades, freed R2 blobs) · **none** (needs a recorded ➖) | `lib/useDeferredRemoval.ts`, `lib/toast.tsx`, `lib/confirm.tsx` |

**Non-touch column below** = the desktop-reachability verdict for the whole
row: every one of its actions is reachable by mouse + keyboard (✅), only via a
gesture with a mirrored door behind ⚙ Avancé (🔶ᴸ — acceptable, by design), or not
at all (❌).

---

## Part 2 — The matrix

### Board (`pages/Board.tsx`, `components/board/*`)

| Entity · action | Row | Gesture | Peek | Add path | Réglages / link | Undo | Non-touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Event · open | ✅ tap | — | ✅ `buildEvent` | — | `?item` via search | — | ✅ |
| Event · edit / share | — | — | ✅ Modifier primaryᴳ / Partagerᴼ | — | board▸events (settings) | — | ✅ |
| Event · delete | — | — | ✅ peek ⋯ dangerᴳ | — | — | confirm¹ | ✅ |
| Event · create | — | — | — | ✅ ＋ `event`; day-page `SectionAdd` | — | — | ✅ |
| Fête / announce · open | ❌ static `Act`, no `onOpen` (Board.tsx:591) | — | ❌² | — | — | — | ✅ |
| Chore · check | ✅ disc | — | ✅ « Fait » | — | — | deferred | ✅ |
| Chore · edit | ❌ no door on board³ | — | ➖³ peek = Fait/Reporter only | — | ✅ maison▸chores | — | ✅ |
| Chore · postpone | — | — | ✅ Reporter ×2 (peek only) | — | — | — | ✅ |
| Todo « À compléter » · check / rename / delete | ✅ disc; tap name → inline edit (🗑 lives inside) | — | ➖ expands in place | ✅ `SectionAdd` + ＋ `todo` | maison▸todos (templates) | deferred | ✅ |
| Projets & Entretien · check / postpone | ✅ disc | — | ✅ Fait + Reporter (semaine/cycle) | ＋ `chores-pick` | ✅ maison▸chores | deferred | ✅ |
| Projets & Entretien · edit | ❌³ | — | ➖³ | — | ✅ only door | — | ✅ |
| Meal (Ce soir / Demain) · open | ✅ tap → recipe or peek (`useOpenMeal`) | — | ✅ `buildMeal` | ＋ `meal` | — | — | ✅ |
| Leftover · done / plan tonight | ✅ disc (Fini) | — | ✅ Ce soir (peek only) | ＋ `leftovers` | — | deferred | ✅ |
| Fridge note · dismiss one | ✅ tap (text) / ✕ (media) | — | ➖ no peek⁴ | strip ＋ → `?plus=note` | — | ❌ none⁵ (media: confirmᴿ) | ✅ |
| Fridge notes · clear all | ✅ broom in strip head | — | — | — | — | deferred | ✅ |
| Drawing · edit / keep / new | ✅ ✏️ + 🖌 badges, « Dessiner » chip | — | — | ＋ `note` (DrawPad)ᴿ | — | — | ✅ |
| Mot · open / reply / keep / delete | ✅ tap (stamps `opened_at`) | — | ✅ all four **visible**⁶ | ＋ `mot`ᴳ | — | — (delete direct⁶) | ✅ |
| Habit · open / edit | ✅ tap; ➖ furniture lives behind the row's own peek + the « En pause » fold **by design** (HabitudesPage — the check-in surface is for tapping, not managing; no ⚙ needed) | — | ✅ Modifier primary | ＋ `habit-pick` | — | — | ✅ |
| Board card · edit mode (move/resize/hide) | — | 🔶 long-press `.wg-slot`⁷ | — | — | ✅ board▸layout + `/board?edit=1` | revert button | 🔶⁷ |
| Greeting · « Depuis ce matin » | ❌ bare tap on the greeting (Board.tsx:1514)⁸ | — | — | — | ❌ no link, no help | — | ❌⁸ |
| Face · switch | ✅ chipᴹ / `MemberSwitcher`ᴷ | — | — | — | — | — | ✅ |
| View · Grille/Mois/Année · day plan · departure | ✅ `BoardViewToggle`, card pills, mini corners | — | — | ＋ `plan-today/tomorrow/departure` | — | — | ✅ |

### La cuisine (`pages/Kitchen.tsx`, `components/kitchen/*`)

| Entity · action | Row | Gesture | Peek | Add path | Réglages / link | Undo | Non-touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Day plan · glance / plan empty / full edit | ✅ tap summary; « À planifier » → inline field; pencil → `/kitchen/day/:date` | ✅ drag day→day (`dayDnd`) | ✅ `buildDay` (zero actions, deliberate⁹) | ＋ `meal` | kitchen▸meals (slots/hero/hours) | — | ✅ |
| Idées / Restants · add / plan / rename / delete | ✅ `EntityCombobox`; chip tap → `MealPlanPicker`; ✏️/🗑 behind ⚙¹⁰ | — | — | ＋ `leftovers` | — | deferred | ✅ (⚙) |
| Meal row (day editor) · reorder / leftover / delete | ✅ ✏️ + row ⋯ (`MealRows.tsx:160`) | ➖ no drag (⋯ Monter/Descendre is the door) | — | — | — | ⋯ confirm-free | ✅ |
| Pantry low · to list / delete / rename | ✅ check = to-list; ✏️ + 🗑 behind ⚙¹⁰ | — | — | ✅ `SectionAdd` ×2 + ＋ `pantry` | — | deferred | ✅ (⚙) |
| À utiliser (use-soon) · clear / rename / add | ✅ check; ✏️ behind ⚙¹⁰ | — | — | 🔶 `SectionAdd` only, no ＋ tile¹¹ | — | deferred | ✅ (⚙) |
| Réserve · use / to list / rename+move | ✅ check; 🛍 `onExtra` (a DO action, both faces); ✏️ behind ⚙¹⁰ | — | — | ✅ `SectionAdd` + ＋ `reserve` | kitchen▸reserve (locations) | deferred | ✅ (⚙) |
| Recipe · open / favourite / filter / create | ✅ card tap → scene (peek retired⁹); ❤ `HeartButton`; collapsible `SearchField` + filter panel | — | ➖⁹ | ＋ `recipe` / `book` / `cook` | kitchen▸apparence (tags/pills/colours) | — | ✅ |
| History · re-plan / day | ✅ chip → « Encore ? »; badge → day peek; pencil → editor | — | ✅ | — | liste▸history | — | ✅ |

### La liste (`pages/Liste.tsx`) — two faces via `listeMode` (⚙ = the non-touch door)

| Entity · action | Row | Gesture | Peek | Add path | Réglages / link | Undo | Non-touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Item · check | ✅ whole row centre + disc | — | — | — | — | in-place mark | ✅ |
| Item · add | ✅ always-open `EditField` (Enter; mic splits a breath into items) | — | — | ＋ `list-item` / ⚡ `/liste/quick` | — | compensating (`useCreateWithUndo`) | ✅ |
| Item · edit | 🔶ᴸ simple: long-press → `/liste/item/:id` | ✅ hold | ➖ scene, not peek¹² | — | Avancé ✏️ | — | 🔶ᴸ ✅ |
| Item · delete | 🔶ᴸ simple: swipe-left | ✅ swipe | item scene Delete | — | Avancé 🗑 | deferred (never logged as bought) | 🔶ᴸ ✅ |
| Item · reorder | ✅ ⠿ hold-drag (« Mon ordre » only) | ✅ | — | — | liste▸aisles (aisle order) | — | 🔶¹³ |
| List · clear checked / sort / cashier / flyers | ✅ « Vider les cochés »; ⋯ « Allées »; buttons | — | — | ＋ `flyer` / `share` / `auto-pick` | liste▸stores/shop/ghost | deferred | ✅ |
| List · search | ❌ no in-page search¹⁴ (global 🔍 only) | | | | | | |

### Les notes (`components/cercle/CercleNotes.tsx`, `NotesList.tsx`) — two faces via `notesMode`

| Entity · action | Row | Gesture | Peek | Add path | Réglages / link | Undo | Non-touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Note · read / expand / tick checklist / play audio | ✅ tap body (multi-expand Set); tap line ticks | — | ➖ expands in place, never the shared peek | — | `?item=<id>` deep link | — | ✅ |
| Note · add | ✅ lean composer (Enter) / Avancé composer (mic+📎) | — | — | ✅ ＋ `cnote` = same composer un-leaned | `?add=1` | — | ✅ |
| Note · edit / delete / reorder | ➖ simple face drops all furniture **by design** | Avancé ⠿ drag | — | — | ⚙ Avancé = the mirror (✏️/🗑/grip) | deferred | ✅ (via ⚙) |
| Note · edit (hand-rolled pair) | 🔶 `NotesList.tsx:286` re-implements ✏️/🗑 instead of `RowActions`¹⁵ | | | | | | |
| Face/scope · switch | ✅ `FaceSelect` chip / `MemberSwitcher`ᴷ — the face IS the scope | — | — | — | — | — | ✅ |

### Maison (`pages/Maison.tsx`, `components/{maison,cercle}/*`)

| Entity · action | Row | Gesture | Peek | Add path | Réglages / link | Undo | Non-touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Routine · run / edit / create | ✅ card tap runs; ✎ on card | — | ➖ no peek (deliberate⁹) | ＋ `routine-pick` (in-sheet picker) | maison▸routines | — | ✅ |
| Person (contact) · open / call / write | ✅ row tap → peek; `tel:`/`mailto:` icons on row AND in peek | — | ✅ `buildContact` (+ ⋯: itinéraire, relier, rdv, vCard) | ＋ `person` | — | — | ✅ |
| Person · edit / delete | — | — | ✅ ✏️ → scene; ❌ delete only inside the form scene¹⁶ | — | member → Réglages▸Membres | confirm | ✅ |
| Person · group membership | 🔶 drag ⠿ onto a group section | ✅ drag | ✅ `togglechips` in peek (the mirror) | ＋ `group` / `connect` | maison▸cercle | — | ✅ |
| Pet · open / edit / delete | ✅ row tap | — | ✅ `buildPet` (delete in ⋯, confirm) | ＋ `pet` | — | confirm | ✅ |
| Group · edit / delete / share / builder | ✅ section-head ⋯ (5 actions, danger last) | — | — | ＋ `group` | maison▸cercle | ❌ no undo¹⁷ | ✅ |
| Business · open / call / write / add | ✅ row tap + quick icons | — | ✅ `buildBusiness` | ✅ ＋ `business` (no in-page add➖) | — | confirm | ✅ |
| Carnet · open / add / restore | ✅ row tap → scene (no peek➖) | — | — | ✅ ＋ `carnet` only➖ | — | ✅ reversible archive (`Disclosure` Restaurer) | ✅ |
| Directory · search | ❌ registered in help, never rendered (Maison.tsx:211)¹⁸ | | | | | | |
| Joindre rail · quick-dial | ✅ foot of Famille/Socialᴹ | — | — | — | — | — | ✅ |

**Footnotes ¹–¹⁸** are carried by the Part 4 backlog items citing the same number
(each verdict lives beside its fix, not in a second list). Two that no fix carries:
⁴ fridge notes deliberately have no peek — the card IS the content, a tap clears it;
¹⁰ the garde-manger + pool ✏️/🗑 moved behind the ⚙ face 2026-08-26
(`lib/surfaceMode`, guarded by `e2e/pantry-advanced.spec.ts`).

### Réglages-only actions (no in-app door — deliberate admin altitude)

Board layout mirror (board▸layout, guest-allowed — device-local) · member admin
(maison▸members, ᴼ kiosk-hidden) · meal slots/hero/hours/colours (kitchen▸meals) ·
aisle order, store filter, ghost (liste▸\*) · chore/routine series admin, todo
templates, cars, schedules (maison▸\*) · recipe tags/pills/measure colours
(kitchen▸apparence) · pairing + guest links (settings▸tablets/guest, ᴼ) ·
display/veille/photos/IA/voix/calme/diagnostics (settings▸\*, mostly guest-allowed
device-local). Verdict: these surfaces are **always-managing by design** — no ⚙
face, `RowActions` unconditional, recorded ➖.

---

## Part 3 — Same action, different door (the drift table)

What Part 2 shows when read column-wise. **Bold** = the convergence target.

| Concept | Today's spellings | Verdict |
| --- | --- | --- |
| **Delete a row** | swipe-left (Liste) · `RowActions` 🗑 (pools, Avancé faces, Réglages) · peek ⋯ danger (event, pet, business) · visible peek danger (mot⁶, meal « Retirer ») · ✕ badge (media fridge note) · hand-rolled trash (NotesList¹⁵, DrawingGallery) · nowhere (chore/home-project³, contact¹⁶) | **`RowActions` on managing faces; peek ⋯ danger for peeked entities; swipe stays a Liste/QuickAdd accelerator, never the only door** |
| **Edit** | peek « Modifier » → Modal (event) · pencil → scene (recipes, day, liste item) · ✎ on card (routine) · long-press (Liste simple) · inline tap-name (board todos) · inline `EditField` swap (CheckRow, MealPool) | acceptable variety — *peek for peeked, scene for scened, inline for one-field* — but each row records which |
| **Add** | always-open composer (Liste, Notes) · `SectionAdd` ＋ (pantry ×3, day page, board todos) · `EntityCombobox` (pools) · ＋ FAB tile (everything) · FAB-only (Maison➖) | **every entity has a ＋-sheet path OR a recorded ➖**; `SectionAdd` when the section is the natural place; always-open only where the page IS the composer (LEAN) |
| **Reorder** | drag ⠿ (Liste, Notes Avancé, board cards) · ⋯ Monter/Descendre (meal rows) · none | drag + a non-drag mirror where drag is the only path¹³ |
| **Long tail** | `ActionMenu` ⋯ at row / section-head / page-tool altitude | ✅ one primitive, three altitudes — fine, document which altitude when adding |
| **Search** | `SearchField` collapsible (Notes simple, Recettes) · always-open (Notes Avancé) · none (Liste¹⁴, Maison¹⁸, Historique, Garde-manger) | **`SearchField` collapsible wherever a list can exceed a screenful** |
| **⚙ Simple↔Avancé face** | Notes + Liste + **garde-manger + meal pools** (2026-08-26, `lib/surfaceMode` factory). Habitudes and board todos: ➖ — furniture already behind a door (row peek / tap-to-edit); Réglages: ➖ always-managing | done (Wave A); a NEW row list picks a face or records why not (door #13) |
| **Undo tier** | deferred (most checks/deletes) · compensating (Liste add) · confirm (heavy) · **none** (single fridge-note⁵, group¹⁷, event¹ post-confirm) | every destructive door names its tier; « none » requires a footnote |

---

## Part 4 — Ranked backlog (verdicts recorded 2026-08-26)

> ❌ = fix; ➖ = deliberate, keep; each cites its footnote. Waves sized like
> PARITY Part 4. ⚠ Composer *layout* (field width, CTA stacking, gutters) is owned
> by the parallel "lean outside, generous inside" pass in `LEAN.md` — out of scope here.

### Wave A — generalize the two-faces pattern 🔴 — **DONE 2026-08-26**

- [x] `lib/surfaceMode.ts` — `createModeStore(key)` factory; `notesMode`/`listeMode` rebuilt on it, keys unchanged.
- [x] ⚙ face for the **garde-manger** (`usePantryAdvanced`, one flag: `PantryTab` ×2 lists + `ReserveSection`; ⚙ in the tab's first header, terracotta) and the **meal pools** (`useMealPoolAdvanced`, read inside `MealPool` so kitchen page + drawer inherit; ⚙ rides the pool's head row, `.kitchen__head--end` when heading-less). DO actions (check, 🛍 restock, tap-to-plan) stay on the simple face; ✏️/🗑 are Avancé.
- [x] e2e: `e2e/pantry-advanced.spec.ts` (default face bare, ⚙ restores, flags independent, reload-persistent).
- [x] ➖ **corrected two pre-seeded targets on code-read**: Habitudes (RowActions already behind the row's peek + the « En pause » fold — `HabitudesPage.tsx:120`) and board todos (🗑 already inside the tap-to-edit state — `TodoSection.tsx:304`) need **no** ⚙; recorded in their Part 2 rows.
- [x] ➖ Réglages surfaces stay always-managing (admin altitude).

### Wave B — one delete grammar 🔴

- [ ] ¹⁵ `NotesList.tsx:286` hand-rolled ✏️/🗑 → `RowActions size={15}` (audio-rename via `onEdit`).
- [ ] `DrawingGalleryPage.tsx:134` bespoke trash → `RowActions` delete-only.
- [ ] `CheckRow.tsx:107` raw `.row-actions__btn` extra slot → an `extra` slot ON `RowActions` (one owner of the class family).
- [ ] ⁵ single fridge-note dismiss (`board/Notes.tsx:158`) → `useDeferredRemoval` (batch broom already has it). ➖ media-note keeps confirm (frees an R2 blob — heavy tier).
- [ ] ⁶ mot's visible « Supprimer »: align to peek-⋯ **or** record ➖ (a mot is ephemeral by nature) — decide at code-read, footnote either way.
- [ ] dead `'note'` arm in `DetailKind` (`lib/detail.ts:22`) — remove.

### Wave C — non-touch doors + discoverability 🟡

- [ ] ⁷ board edit mode: on-surface mouse door (« Organiser » near `BoardViewToggle` / a `SecLabel` action) mirroring the long-press; Réglages▸Disposition stays the SR mirror.
- [ ] ⁸ greeting → « Depuis ce matin »: real labelled `<button>` + a help/guide point (merge into an existing card — DISCOVERY ceiling).
- [ ] ¹⁸ Maison directory search: render the registered `SearchField` (collapsible) in Famille/Social.
- [ ] ¹⁴ Liste in-page search: ➖ for now — the list is finite and short by design (calm); revisit if lists regularly exceed a screenful.
- [ ] `useSwipeToDelete` red-pane markup duplicated (`Liste.tsx:184`, `QuickAddPage.tsx:245`) → the hook/component owns the pane.
- [ ] ¹³ reorder mirrors: Liste « Mon ordre » drag-only → ➖ (order also editable implicitly via aisle sort; keyboard reorder deferred with why) — or add ⋯ Monter/Descendre like meal rows.

### Wave D — ＋ sheet coverage 🟡

- [ ] ¹² `SECTION_MODES` fallback: scene routes (`/voyage`, `/voiture`, `/habitude`, `/cercle/*`, `/liste/quick`…) get **board** tiles today — hide the FAB on scenes or map sensible modes (cheap correct slice now, rest recorded).
- [ ] ¹¹ use-soon (« À utiliser ») has no ＋ tile — fold into the `pantry` tile as a second field/toggle, or record ➖ (SectionAdd suffices for a short list).
- [ ] ² fêtes/announce rows: give `buildEvent`'s birthday-style peek (Le cercle door) or record ➖ static-by-design.
- [ ] ⁹ recorded ➖ (keep): recipe/routine/day peeks retired under "tap the thing, get the thing" (`adapters.ts:503-518`); `buildDay` zero-actions; Maison in-page add (FAB-only).
- [ ] ³ recorded ➖→🟡: chore/home-project edit from the board — peek stays Fait/Reporter (calm glance surface); the edit door is Réglages. Revisit only if Marc trips on it.
- [ ] ¹⁶ contact delete only in form scene — align with pet (peek ⋯ confirm) or record ➖.
- [ ] ¹⁷ group delete gets undo (deferred) or records ➖ (confirm is the tier — membership cascade).
- [ ] ¹ event delete: ➖ confirm-no-undo is correct (series delete = heavy tier).

---

## Part 5 — The new-action checklist (canonical)

When ANY new user action ships (on a new or existing entity), walk this; a skipped
line is a recorded ➖ with a why. Feeds PARITY Part 5's UX-reach block.

- [ ] **Primary door** picked from Part 1 — reuse the owning primitive, never a bespoke button/gesture.
- [ ] **Non-touch mirror**: if the door is swipe/long-press/drag, name the mouse+keyboard path (⚙ Avancé furniture, peek action, ⋯ item, or Réglages) in a code comment.
- [ ] **Undo tier declared**: deferred / compensating / confirm / ➖-with-why. Destructive + polled ⇒ `useDeferredRemoval`, never optimistic-then-defer.
- [ ] **Gating**: guest (`isGuest()` only if it writes `/api/*` — device-local prefs stay open), toddler/simple lens, kiosk vs mobile, operator scope, AI/R2-unset fallback.
- [ ] **⚙ face**: on a two-faces surface, does the action belong to the reading face (≤1 act per row) or the Avancé face (furniture)?
- [ ] **Discovery**: ＋-sheet tile (`SECTION_MODES` + `ADD_HELP`) or recorded ➖; « ? » help entry; guide card merge if it changes a main surface (`DISCOVERY.md`).
- [ ] **Matrix**: add/update this file's Part 2 row **in the same commit**.
