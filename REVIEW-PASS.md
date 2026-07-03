# REVIEW-PASS — a slow, section-by-section audit of the whole app

> **Purpose.** One living plan to review **every section and every feature** of
> Babillard for what's **missing**, what's **overlooked/redundant**, and what needs a
> **UI/UX** pass — worked through **slowly, one section at a time**. Produced 2026-07-01
> from a full code map (routes, the six hub tabs, their sub-modules, and the single
> taxonomy in `src/lib/guideContent.ts`).
>
> **How to use it.** All 8 sections have been reviewed; the batch of confirmed bugs +
> security + a11y + reuse fixes shipped 2026-07-01. What remains is the ~119 section-level
> findings in the blocks below (§1–§8), tagged P1/P2/P3 — pick one, fix it, tick its box.
> Cross-links are mapped in the [ledger](#cross-link-ledger-do-once-shared-work) so fixing a
> seam once closes it for both sections.
>
> **Non-negotiables (every change).** Read `CLAUDE.md` → _Build by reuse_ first: reuse a
> primitive / lib helper / CSS family before creating one. The calm-tenet test
> (`functions/db/migrations/calm-tenets.test.ts`) is law — no streak/points/badge/push,
> no inventory count, no unread **counts**. Every UI change is **mobile-** and
> **tablet/toddler-friendly**. New `/api/*` = handler + `authed()` + `worker/routes.ts`
> row + `keysForPath`. Push straight to `main`; CI is the only gate.
>
> **Not a duplicate of.** The **Board** already has its own deep review + backlog in
> [`AUJOURDHUI.md`](./AUJOURDHUI.md); this plan **points at it** for Board and does not
> re-audit it. Shared-UI reuse debt lives in [`COMPONENTS.md`](./COMPONENTS.md) +
> [`UNIFORMIZING.md`](./UNIFORMIZING.md); mots/lifecycle follow-ups in
> [`PLAN-mots-and-lifecycle-followups.md`](./PLAN-mots-and-lifecycle-followups.md). When a
> finding really belongs in one of those, log it **there** and link it from here.

---

## Combined review synthesis (2026-07-01 — all 8 sections reviewed)

> Every section (§1–§8) was audited by fan-out reviewers. **Headline: the codebase is mature
> and reuse-disciplined — no architectural rot.** Findings are seams, a11y, e2e, and a handful
> of real-but-contained bugs. The **first implementation batch shipped** (below); the recurring
> themes here are what still matters — fixing each one **once** closes it across many sections.

### Cross-cutting themes (each recurred in 3+ sections — fix once, everywhere)

> _Themes 1, 3, and part of 6 were substantially addressed in the shipped batch; 2, 4, 5
> (latent), 7 and the rest of 6 remain live. Section blocks carry the exact open items._

1. **`useWrite()` bypass — now RESOLVED to a short list.** ~90% migrated; the server broadcasts
   realtime on every write regardless, so a bypass loses **only** offline queue/replay. Real gaps:
   `DealsBrowser` list-add, `useRecipeShop`, `RoutinePlayer` progress, `keepSuggestion`, + a
   household-settings PATCH inconsistency. Everything else (AI / auth / blob uploads) is correctly
   online-only. _(Full list in §8.)_
2. **Query keys spelled outside `lib/queryKeys.ts`.** ✅ **Mostly closed** — `['ghosts']`/
   `['list-history']` centralized (Batch E); the dead `['list']` invalidate removed (Batch A);
   **`['routines']`→`ROUTINES_KEY`, `['carnets']`→`CARNETS_KEY`, `['health']`→`HEALTH_KEY`
   centralized 2026-07-02** (0db44cb). _Remaining (page-local, acceptable as single-source-per-page):_
   `GALLERY_KEY=['drawings']`, `INTAKE_KEY`/`POSTBOX_KEY`/`THIS_WEEK_KEY`/`ContactPhotos`.
3. **a11y: incomplete tablist + missing `aria-pressed`.** ✅ **Closed.** Réglages tablist +
   `aria-pressed` on the toggle-chip pickers + the dropped per-second `aria-live` all shipped in
   Batch D. The shared **`SubTabs`** control (La cuisine / Le cercle / flyer+deal browsers) gained
   **roving tabindex + ←/→/Home/End nav** 2026-07-02 — so the cercle section nav (and every other
   SubTabs surface) is keyboard-navigable in one fix; regression-tested (`nav-tabs.spec.ts`).
   _(Remaining nicety: `aria-controls`/panel `id` linking — deferred; panels are caller-managed.)_
4. **e2e is screenshots-only almost everywhere.** Behavioural coverage is missing for: aisle-sort,
   cook stepper, toddler kitchen, guest/intake/postbox flows, the carnet scene, **Voyage entirely**,
   Search, capture-degrade+reroute, and idle/offline/realtime. The correctness-critical *logic*
   (recur, closure, idempotency, vcard) is well unit-tested — it's the *flows* that are blind.
5. **The media-undo-blob rule.** Undo-after-delete of a media row resurrects a row pointing at a
   freed R2 blob. **CONFIRMED live in Voyage Infos/Itinéraire (§7 P1);** ~~latent in `NoteEditor`
   in-editor replace (§3)~~ — **NoteEditor fixed 2026-07-02** (session-key cleanup via
   `DELETE /api/note-media`; see the shipped-log entry below). The rule the correct code already follows (Documents / gallery /
   care-log): **a media-bearing row deletes via `useConfirm` (no undo), text-only rows can undo.**
6. **Forked-instead-of-reused primitives.** Postbox forks `MemoControls`; `ContactForm` forks
   `GroupForm`; the on/off `Toggle` is hand-rolled ~8× (ambient/display); two Markdown grammars;
   Union-Find ×4; `capitalize` ×3; measure-colour forks `ColorPicker`. Each is a small
   extract-and-reuse.
7. **Cold-load false empty-states.** Search, Photos, and RecipeTags render "aucun résultat"/empty
   before their queries settle (no `isLoading` guard).

### ✅ Shipped 2026-07-01 — the review pass (commit "Whole-app review pass + fixes (Batches A–H)")

All 8 confirmed bugs and the two P1 security findings were fixed and committed in batches A–H.
For the record: #1 member CRUD→`CERCLE_KEY`, #2 Voyage media-note confirm-not-undo, #3 realtime
`keysForPath` drift, #4 routines narration-blob free, #5 trip-delete, #6 carnet restore, #7 capture
offline feedback, #8 EventForm bring-list draft guard; plus the security batch (server-enforced
intake field-scope bitmask, pending-submission cap, `showcase` default-deny + issuer warning,
PostboxReview matched-face), the a11y sweep (Réglages tablist + roving nav, `aria-pressed` on the
toggle pickers), the reuse batch (shared `Toggle`, centralized `GHOSTS_KEY`/`HISTORY_KEY`, shared
`capitalize`/`UnionFind`, unified Markdown grammar, `ContactForm`→`GroupForm`), the offline-write
batch (`DealsBrowser`/`useRecipeShop`/`keepSuggestion`→`useWrite`), Search over carnets+home-projects,
and two e2e specs (aisle-sort, capture-offline).

### Still deferred from the pass (real backlog, with rationale)

- ~~**NoteEditor immediate-upload orphan**~~ — ✅ **Shipped 2026-07-02.** Went the *client
  cleanup endpoint* route (not deferred-upload): the editor now tracks every key it uploaded
  this session (`sessionKeysRef`) and, on close, frees any the saved note won't reference via
  the new **`DELETE /api/note-media`** (authed, `nm_`/`ns_`-prefix-scoped, best-effort). Covers
  replace, remove, re-draw (png+scene), and discard; the note's own persisted keys stay owned
  by the server-side PATCH/DELETE. Chose this over deferred-upload to keep the resized-preview +
  lazy R2-off UX intact — and freeing-by-key is symmetric with the app's read-by-key capability
  model (`api/img/[key]` is unauthenticated by design).
- ~~**Postbox forks `MemoControls`**~~ — ✅ **Shipped 2026-07-02.** Added a STAGE mode (`onStaged`)
  to the shared component so the guest stages-then-sends path reuses it; see the closed finding below.
- **Security hardening left:** full token **revocation** (a `guests` table changes the stateless
  model). (`staged_media` ownership check ✅ + `/api/live` per-kind gating ✅ shipped 2026-07-02 —
  a guest is now 403'd at the realtime upgrade, and the client skips the socket for guests/preview.)
- **Conscious `useWrite` deviations:** the household-settings PATCHes (rarely-offline — documented,
  not necessarily fixed). _(`RoutinePlayer` step-progress is no longer one — migrated 2026-07-02.)_
- **e2e backfill (the big remaining gap):** carnet-restore, guest intake/postbox flows, the carnet
  scene, **Voyage entirely**, capture AI-off degrade+reroute, idle wake/drift — each needs new mock
  scaffolding + a runnable pass. ✅ **The 3 pre-existing failures are FIXED** (2026-07-02, d80cbe5 +
  288c146): `board-customize` ×2 + `meals` slot-icon were time-of-day-flaky (board lifecycle folds
  "past" mock items vs the real clock) → a surgical `page.clock.setFixedTime(BASE)` on just the two
  timed-item tests, plus a stale band-count (4→5, Mots joined the band). A new `e2e/onboarding.spec.ts`
  locks the seed→explore→clear→setup sequence (stateful `/api/seed` stub). Full suite green.

The **section blocks below (§1–§8)** are the live backlog — ~119 findings, tagged P1/P2/P3.

---

## Triage reconciliation (2026-07-02)

The per-section checkboxes had drifted: many findings were fixed in batches A–H (2026-07-01)
and the 2026-07-02 work but never ticked. An 8-agent parallel sweep re-verified **every** open
`[ ]` against current code. Result: **27 were already fixed** (now ticked `[x]`), **17 are
partial**, the rest remain genuinely open. The 17 partials — what's LEFT on each (the actionable
remainder), by §line:

- **169** (Kitchen useWrite bypass) — ✅ **closed 2026-07-02**: migrated `patchGhost` (QuickAddPage), `MealSlotsSection`, `ShopSection`. Only `EmptyFridgeSheet.save` stays on `api()` — deliberate (AI-gated + needs a sync id, like `createBringList`).
- **211** (Kitchen e2e) — cook-stepper + Vide-frigo covered; suggestion cards / shop-the-week / config-PATCH / list drag-reorder still uncovered.
- **233** (Kitchen empty CTA) — recipe-book CTA added; `ToddlerCookBook` still shows a "0 recettes" dead cover.
- **303** (Routines step-editor e2e) — add-card + emoji palette covered (screenshot only); no remove/reorder/media/POST-alignment assertion.
- **424** (Cercle e2e) — `note-editor.spec` real behaviour added; carnet/businesses/ReviewChecklist/group-CRUD still specless.
- **442** (Cercle Union-Find) — unified into one `UnionFind` class; `relationsOf`/`relationTo` still live in `Cercle.tsx`, not moved to `cercle.ts`.
- **459** (NoteEditor nits) — orphan-blob fixed; body `aria-label` still hardcoded `editorNew` in edit mode, audio-note edit still title-only, `firstLine` exported-only.
- **509** (guest rate-limit/revoke) — `MAX_PENDING=200` cap added; still stateless, no revoke, no per-token upload cap.
- **518** (showcase over-share) — issuer warning + 24 h TTL cap shipped; still the DEFAULT kind + still a broad denylist, not a curated subset.
- **559 / 822 / 931** (e2e — guest / Voyage / offline-layer) — postbox + guest-scenes specs added; intake submit→review→accept, ALL Voyage, and outbox/SW/WS/idle behaviour still uncovered.
- **668** (Settings error states) — ✅ **closed 2026-07-02**: `ThisWeekTogetherSection` now reads `isError` and shows `t.common.loadFailed` instead of a false empty week (only when no cached frame). Photos already guarded `isPending`.
- **729** (createBringList silent) — ✅ **closed 2026-07-02**: `EventForm.createBringList` catch now sets `bringErr` → `StatusMessage`; « Créer la liste » disabled + a « Indisponible hors-ligne » hint when `!useOnline()`.
- **747** (capture keys) — shared GHOSTS/HISTORY keys done; `MONTH_KEY` still absent from `CAPTURE_KEYS`, event/task/meal titles still unclamped server-side.
- **808** (Search coverage) — carnets + home-projects ingested; drawings / care_log / home_pins still not.
- **830** (cross-cut nits) — `capitalize` unified into `lib/format.ts`; `DeparturePage` empty still hand-rolled, `GALLERY_KEY` local literal, a gallery members query missing `...live`.
- **880 / 927** (offline/ambient) — most writes on `useWrite` + shared `Toggle`; ✅ `RoutinePlayer` now routes its three routine PATCHes through `writeWith(qc, …)` so an offline tap queues (finding 329 closed too, 2026-07-02). Still open: `AmbientScreen` re-rolls its own clock.

Everything else still `[ ]` below is genuinely open. **NOTE (2026-07-02):** finding **554** (mic-denied
silently swallowed) now lives in the shared `MemoControls` after the Postbox refactor, so it affects
the board memo path too — a good small next fix.

---

## Reading the section blocks

**Finding tags** used below: `[ ]` todo · `[~]` in progress · `[x]` done · severity
**P1** (quick, high-value / a11y) · **P2** (small design pass) · **P3** (bigger / judgement
call). Sections are ordered so each one's **feeders** sit next to it (Kitchen↔Liste,
Routines, Le cercle, Share-links, Settings, Capture, Scenes, Ambient/offline). **Board is
excluded** — its own backlog lives in [`AUJOURDHUI.md`](./AUJOURDHUI.md). Each block opens
with a one-line current-state + verdict, then P1/P2/P3 findings and "strengths to keep".

---

## 1. Kitchen ↔ Liste — the shopping spine

**Files.** `src/pages/Kitchen.tsx` (sub-tabs meals/pantry/recipes) · `src/pages/Liste.tsx`
· `src/components/kitchen/*` · scenes `/kitchen/*` + `/liste/*` · config in
`operator/{meals,reserve,recipesTags,recipePills,shopping,aisles}.tsx`.

**Current state (one-liner).** Meal week-grid + ideas pool + leftovers + pantry ("running
low" + réserve) + recipe book (import/AI/collections/cook mode) all **write into the ONE
active `/liste`**, which sorts by "Mon ordre" or "Par allée", browses flyers, and hands off
to Cashier. Toddler lenses: `KidKitchen`, `KidCollections`, `ToddlerCookBook`.

**Cross-links to close in this sitting.**
- Planned meals → Board "Ce soir" + day note. Verify the review didn't leave the board hero stale.
- Shop-the-week / running-low / recipe ingredients → **La liste** (`['board']` cache). One spine — review the write path once here.
- Recipe → **Routine** (`useRecipeToRoutine`). Confirm it round-trips.
- Config lives in **Settings ▸ Cuisine** (tags/pills/measure colours/meal slots/réserve) + **Magasinage** (aisles/stores/history/ghost) — audit those panels here, not in §5.
- AI suggestions gated by **Settings ▸ Système ▸ AI** + degrade when `AI` unset.

**Verdict (2026-07-01).** The spine is **mature and well-factored** — the single-list
model, deferred-removal discipline, deal↔item reuse, the `MealPool` twin-collapse and the
hook split (`useMealPlanning`/`useMealSuggest`/`useRecipeShop`/`useAiWake`) are all correct.
Calm is clean (no counts/ranks/quantity; ghost stays opt-in; hearts show faces not counts).
Findings cluster in **seams, a recurring `useWrite` bypass, tap targets, and e2e gaps** —
not structural. Four reviewers; findings deduped below.

### Findings — P1 (quick, high-value / a11y)

- [x] **`💡` emoji literal instead of the Phosphor glyph.** ✅ Batch A — `MealRows.tsx:128` now
  uses `InlineIcon name="sparkle-bold"`, matching the guest branch.
- [x] **Aisle sort has ZERO e2e coverage.** No test touches `list-sort` / "Par allée" /
  `aisleFor` / `AislePicker` (grep across `e2e/**` = none). Core, logic-heavy feature
  (classifier + household order + per-item overrides) shipping untested at the UI level.
  Add an interactions spec (toggle, group headers, override). _(largest single gap in §1)_
- [x] **Stacked live regions announce over each other.** — ✅ **Fixed 2026-07-02**: the
  `.kitchen__results` container is now the single `aria-live="polite"` region (atomic
  default false → only the newly-added line/card announces); dropped `role="status"` from
  the waking line + each suggestion card.
- [x] **Aisle group header is `role="presentation"`** — ✅ **Fixed 2026-07-02**: the
  `.list-aisle` header is now `role="heading" aria-level={3}` (`Liste.tsx`), so a SR user in
  "Par allée" gets the aisle grouping cue and can jump between aisles by heading.

### Findings — P2 (small design pass)

- [x] **Recurring `useWrite()` bypass — writes that silently drop offline.** — ✅ **Closed
  2026-07-02.** `keepSuggestion` + `useRecipeShop.confirmShop` were already migrated; this
  batch routed the rest through `useWrite`: `QuickAddPage` ghost-mute (was `patchGhost`→
  `api('ghost',PATCH)`), `MealSlotsSection` + `ShopSection` (household PATCHes). **The lone
  remaining `api()` is `EmptyFridgeSheet.save` — kept deliberately:** it's AI-gated (you can't
  reach it offline — the recipe comes from an online Workers AI call) AND needs the new
  recipe id synchronously to route to `/cook`, which a queued write can't return (same class
  as `createBringList`).
- [ ] **Toddler cook-mode exit leaks to the parent recipe sheet.** `KidKitchen` cooks via
  `/kitchen/recipe/:id/cook`; `CookPage` closes to `RecipeViewPage`→`RecipeSheet`, whose
  read-only gate is `ro = isGuest()` **only, not audience** (`RecipeSheet.tsx:52`). A
  toddler tapping ✕ after cooking sees Edit/Delete/Plan/Share. Gate `ro` on
  `audience==='toddler'` too, or close toddler cook back to `/kitchen`.
- [x] **`keepSuggestion` gives no feedback and double-adds.** `Kitchen.tsx:343-349` POSTs to
  `meal-ideas` but never clears/disables the card or toasts → tapping "Garder" twice inserts
  the idea twice. Clear-on-keep (+ the undo toast used elsewhere).
- [x] **Meal-row control cluster is sub-44px with up to 6 icon buttons.**
  `MealRows.tsx:141-203` (heart/book/↑/↓/leftover/trash); `.kitchen__meal-btn` min is
  **32px** (`kitchen.css:613`), below the 44px rule and cramped at 320–430px. Bump to 44px
  and/or fold reorder/leftover behind `RowActions`.
- [ ] **Today's meal writes don't all invalidate `BOARD_KEY`** → "Ce soir" hero stays stale
  until the next poll. `DayPlanPage` `planRecipe`/`clearMeal`/`clearSlotMeals`/`clearDay`/
  `saveSlot` pass only `[MEALS_KEY]` (whereas `renameMeal`/`saveMeal` include `BOARD_KEY`).
  Add `BOARD_KEY` to the today-affecting writes.
- [x] **`MeasureColorsSection` forks the colour UI.** — ✅ **Resolved 2026-07-02 as DELIBERATE**
  (the finding's own "unless the free-form picker is deliberate" branch). The measure defaults
  (`measureColors.ts`: leaf green / teal / golden yellow …) are matched to a household's PHYSICAL
  colour-coded spoons/cups and are **not** in the member `PALETTE`; `ColorPicker` would make it
  impossible to match a real spoon. Kept the free-form OS picker + added a code comment so it isn't
  re-flagged. (Not a fork to fix — a genuinely distinct requirement.)
- [x] **`HistorySection` delete has no confirm and no undo** — ✅ **Fixed 2026-07-02**:
  `remove` (`operator/shopping.tsx`) now hides the row locally + holds the DELETE behind the
  shared `useUndoToast` (deferred; onUndo reloads it back). Matches the list's undo idiom.
- [ ] **`CashierPage` has no empty/error state** — a cold deep-link with an empty pick set
  flashes `Loading`→redirect to `/liste` with no message (`CashierPage.tsx:33`).
- [ ] **Restock / réserve adds don't refresh predictions.** `PantryTab`/`ReserveSection`
  add with `affectedKeys:[BOARD_KEY]` only; the canonical `Liste.postAdd` also invalidates
  `[GHOSTS_KEY, HISTORY_KEY]`, so a low/reserve item lingers in the quick-add candidate set
  until the next natural refetch.
- [ ] **Guest handling inconsistent across config panels.** Most render a read-only legend;
  `MeasureColorsSection` returns `null` (whole section vanishes, `display.tsx:477`). Prefer
  a uniform read-only legend.
- [ ] **e2e blind spots** (beyond aisle-sort, P1): interactive **cook-mode** stepper
  (`/kitchen/recipe/:id/cook` never navigated — only `cook/multi` smoke-tested); the
  **AI/book/use-up suggestion cards**, **shop-the-week**, and the **Vide-frigo** sheet;
  **toddler kitchen picker** (KidKitchen/KidCollections/ToddlerCookBook interaction — the
  highest-quality, most interaction-dense part of the slice); config panels are
  **screenshot-only** (a broken PATCH / dead reorder would pass); list **drag-reorder**.

### Findings — P3 (bigger / judgement)

- [~] **Un-shared query keys drift.** `['ghosts']`/`['list-history']` are spelled inline at
  `operator/shopping.tsx:276` and re-declared as local `GHOSTS_KEY`/`HISTORY_KEY` in
  `Liste.tsx`, `QuickAddPage.tsx`, `quickItems.ts`, `AddSheet.tsx` — 5+ copies. Move to
  `lib/queryKeys.ts`. ✅ **Batch A: the dead `['list']` invalidate is removed** (`useRecipeShop.
  ts`, `RecipeSheet`, `RecipeListPicker`, + the server `keysForPath`). Remaining: centralize
  ghosts/history (Batch E).
- [ ] **Duplicate "which ingredients?" checklist.** `RecipeListPicker.tsx` (modal) and the
  inline `listPrompt` in `RecipeSheet.tsx:408-442` reimplement the same tick-list +
  select-all + `recipe-to-list` POST. Extract one shared checklist body.
- [x] **Adding recipe ingredients to La liste has no undo** — ✅ **Fixed 2026-07-02**:
  `RecipeListPicker.confirm` now DEFERS the `recipe-to-list` POST behind `useUndoToast`
  (mirrors `ReserveSection.addToList`) — the write only fires if you don't undo, so no
  inverse is needed (the endpoint returns a count, not ids).
- [ ] **`shopRecipe` silently no-ops** when a recipe has no non-heading ingredients
  (`Kitchen.tsx:84`) — the peek's "Ajouter à la liste" dead-taps with no feedback.
- [ ] **Empty-state dead-ends:** empty recipe book has no direct "add a recipe" CTA (only a
  guide link, `RecipesTab.tsx:413` — create is ＋-FAB-only); `ToddlerCookBook` with zero
  recipes shows a cover reading "0 recettes" (`:84`), a dead book.
- [ ] **Heart faces truncate at 4 with no "+" signal** (`HeartButton.tsx:32`) — calm-correct
  (no count) but "which faces" is incomplete on a 5+ member household.
- [x] **`MealIdeas` empty state has no guide deep-link** — ✅ **Fixed 2026-07-02**:
  passes `guide={{ card: 'kitchen' }}` to `MealPool` (the kitchen card explicitly covers
  meal ideas), matching `Leftovers`' `guide={{ card: 'leftovers' }}`.
- [x] **`RecipeTags` "in use" strip flashed empty on cold load** — ✅ **Fixed 2026-07-02**
  (Phase 0): guarded on `tagsQ.isPending` (`recipesTags.tsx:188`). _(Correction: **`RecipePills` is
  NOT a false-empty** — it falls back to `DEFAULT_PILLS` on cold load, `recipePills.tsx:50`, so the
  original "flash of aucune" claim was inaccurate. A failed fetch still silently shows defaults.)_

**Strengths to keep.** Deferred-removal on the live-polled list is correct (check = mark,
not removal; clear/delete held behind undo + refetch — no flash-back). Deal↔item reuse
(`picks.tsx`) never spawns a specific-named duplicate. AI degrade paths (`useAiWake` +
503→non-AI save) never crash. Ghost opt-in defended in code + comment. Toddler `BigTiles`
hear-first (deterministic tints, two-tap arm/commit) is the high point of the slice.

---

## 2. Routines

**Files.** `src/pages/Routines.tsx` (`KidView` toddler / `RoutinesParent`) · scenes
`/routine/new`, `/routine/:id`, `/routine/:id/run` (`RoutineRunPage` + shared
`RoutinePlayer`) · built in `operator/chores.tsx`.

**Current state.** Parent = overview grid of who-has-which routine (avatar + step pictos,
edit ✎ / run ▶); toddler = picture-card run read aloud on-device. Per-step countdown timers.

**Cross-links to close.**
- Built/edited in **Settings ▸ Corvées ▸ Routines** — review both here.
- **Kitchen** recipe→routine lands here.
- Read-aloud via shared `lib/speak`; voice config in **Settings ▸ Affichage ▸ Voix** (+ optional R2 voice clips per card — degrade when R2 unset).
- A routine can auto-open for the device's picked **face** (profile).

**Verdict (2026-07-01).** Mature and well-commented; `RoutinePlayer` is correctly shared
across KidView / run scene / parent ▶, the wall-clock timer is robust, calm is a genuine
toggle (finish-and-stop vs re-tappable), and the toddler lens (tap-to-hear hero + filmstrip,
one-way door) is strong. **chores and routines are co-located but NOT tangled** in
`chores.tsx`. One real defect (an R2 leak, confirmed by both reviewers), plus edit-surface
duplication and timer/e2e gaps. Two reviewers; deduped below.

### Findings — P1 (quick, high-value / a11y)

- [x] **`ROUTINES_KEY` spelled as the literal `['routines']` at the hot write sites** —
  `RoutineForm.tsx:144,157` + `chores.tsx:113,118,131,136` hardcode it while
  `queryKeys.ts:12` exports the constant (which `RoutineFormPage` imports correctly). Import
  the constant (the "key spelled twice drifts into two caches" hazard).
- [x] **Per-second `aria-live="polite"` stopwatch** (`RoutinePlayer.tsx:352`) makes a screen
  reader announce the elapsed time once a second — noisy. It's a glanceable count-up, not
  status → set `aria-live="off"`.

### Findings — P2 (small design pass)

- [x] **R2 voice-clip (narration) blob leaks on edit — media-cleanup asymmetry.**
  `functions/api/routines.ts` PATCH frees dropped **photo** keys (`~:279-284`, `deleteR2Blob`)
  but has **no equivalent for narration clips** (`~:249-257` just re-aligns the array), so
  removing a card / clearing a clip / re-recording orphans the old audio blob. DELETE frees
  both (`:371`). **Confirmed by both reviewers.** Mirror the photo cleanup for
  `cards_narration_json`.
- [ ] **Double edit surface for one routine.** Réglages edits the deck **inline in a `<li>`**
  (`chores.tsx:157`, `members={[]}`) while the Routines-tab picker edits it in the
  **full-screen scene** (`RoutineFormPage`) — which exists *specifically because this deck
  "was the worst sheet offender" under the keyboard*. The inline path re-introduces the exact
  problem on mobile. Route the Réglages ✏️ to `/routine/:id` for one ergonomic path.
- [ ] **No delete affordance in the Routines tab or edit scene** — deleting forces a trip to
  Settings ▸ Corvées. Add a delete in the edit scene / detail peek.
- [ ] **Nested interactive-in-interactive on the parent grid** — `<button>` edit + `<button>`
  run inside a `role="button"` card (`Routines.tsx:134-231`); works via `stopPropagation` but
  fragile for keyboard/AT. Make the card a non-button `<article>` with explicit controls.
- [ ] **e2e — the step editor itself is untested.** "Add a kid routine" only fills the name;
  no add/remove/**reorder** card, picto pick, or media attach. The whole correctness story of
  `CardDeckEditor` (parallel photo/narration arrays staying index-aligned on reorder/remove)
  has no editor-level test. Add a Playwright case asserting the POST arrays stay aligned.
- [ ] **e2e — per-step countdown timer has zero coverage** — the most intricate logic
  (wall-clock `endsAt`, pause/resume/restart, chime-once, cross-close persistence) is
  untested.

### Findings — P3 (bigger / judgement)

- [ ] **Routines never surface on the Board, yet saving invalidates `BOARD_KEY`**
  (`RoutineFormPage.tsx:52`) — a dead invalidate (no routine ref in `board.ts`/`Board.tsx`).
  **Decision:** either wire a "morning routine" board glance (a *possible missing feature*)
  or drop the invalidate. _(worth Marc's call.)_
- [ ] **Two timers on screen at once** on a timed step — the `Countdown` ring
  (`RoutinePlayer.tsx:310`) *and* the run count-up stopwatch (`:351`) both show; potentially
  confusing on the toddler surface. Design decision on whether both belong.
- [ ] **Parent overview shows no "done today"** (`Routines.tsx:194`) while the toddler picker
  shows `doneCount/total` (`KidView.tsx:206`) — information asymmetry (calm-by-omission?).
- [ ] **`RoutinesSection` has no empty state** (`chores.tsx:154` — bare `<ul>` + add) where
  every sibling uses `EmptyState`.
- [ ] **Photo file input is `hidden`, not keyboard-reachable** (`CardDeckEditor.tsx:502`) — a
  hidden input isn't focusable; use `sr-only` positioning or make the label a button. Palette
  emoji buttons also lack `aria-label` (`:198`).
- [ ] **ToD chip render block copy-pasted twice** within `RoutinesSection` (guest badge vs
  button, `chores.tsx:178-206`).
- [x] **Player optimistic mutations use `api()` not `useWrite()`** — ✅ **Fixed 2026-07-02**:
  all three `RoutinePlayer` mutations (toggle / reset / timer) now call `writeWith(qc,
  'routines', …)` inside the `useOptimisticMutation`, so a tap made offline queues to the
  outbox and replays. The optimistic apply + guest guard are unchanged; a server 4xx still
  rolls back via `onError`.

**Strengths to keep.** Shared `RoutinePlayer` (mutation lives inside it, all mounts behave
alike); wall-clock timer survives backgrounding + clamps garbage server-side; calm is a real
toggle; recipe→routine / drawing→routine copy step media to a fresh `rcp_` key (recipe
deletion won't blank the routine); one-way door + guest read-only honoured; R2-unset degrades
to TTS/emoji.

---

## 3. Le cercle (+ carnets, pets, businesses)

**Files.** `src/pages/Cercle.tsx` (`?section=` social/family/notes/business/carnets;
`?view=` list/links/tree) · scenes `CercleFormPage`, `CercleFamilyPage`, `CerclePetPage`,
`CercleCarnetPage`, `CercleWorldPage` (Notre monde) · `src/components/cercle/*`
(`CercleWeb/Tree/Constellation/Ego`, `ContactForm/Fields/Photos`, `PetForm`,
`FamilyBuilder/CompleteFamilies/ConnectPeople/LinkComposer`, `BusinessesTab/Form`,
`CarnetsTab/Form/Docs`, `CareLogForm`, `CercleNotes`, `NoteEditor`).

**Current state.** Family/friends directory: contacts + R2 photo + structured links with
auto-inverse + Union-Find families; three views; rich Notes; Businesses (vet/plumber,
isolated from the people graph); Carnets (home/auto/things as synthetic members); pets as a
`'pet'` PersonKind; toddler `CircleKidView`.

**Cross-links to close.**
- Members mirror **Settings ▸ Maisonnée** + drive **Board faces / profile** — audit the member shape parity here (three Member shapes exist — see memory).
- Birthdays surface on **Board "À venir"** (derived, no event rows).
- Carnets → **Board `CarnetsCard`** + carnet-scoped Entretien.
- People/pets/businesses appear in global **Search** (§7).
- Intake/postbox submissions arrive via **share-links** (§4) and are reviewed in Settings.

**Verdict (2026-07-01).** Four reviewers (directory+views, forms+builders, notes+businesses,
carnets+world). **Mature and reuse-disciplined**; no correctness bug in the closure engine
or the snake↔camel API mapping, media invariant + R2-free verified across photos/docs/notes,
calm intact. Weaknesses cluster in: a **reversible archive with no restore UI** (real), a few
**reuse forks** (inline group-create, duplicated Markdown grammar, hand-rolled section nav +
Union-Find ×4), the **three-Member-shape seam** on the face control, a **keyboard-viewport**
miss on the note editor, and **screenshots-only e2e** across almost the whole section. Tags
below: `[dir]` directory/views · `[frm]` forms/builders · `[nte]` notes/businesses ·
`[crn]` carnets/world.

### Findings — P1 (quick, high-value / a11y)

- [x] **[crn] Carnet "archive" is reversible in the DB but has NO restore path anywhere.**
  DELETE sets `archived_at` (`functions/api/carnets.ts:240`), GET filters `archived_at IS
  NULL` (`:100`), and nothing ever clears it or lists archived rows — so `removeCarnet` is
  effectively a **permanent delete behind a confirm**, and the CLAUDE.md-sanctioned exception
  ("a carnet + descendants hide but can be restored") is unimplemented. Add a restore/corbeille
  affordance, or the exception is dead capability. _(Marc's call: build restore, or accept as
  delete.)_

### Findings — P2 (small design pass)

- [x] **[dir] The 5-button section nav is hand-rolled and cramps on mobile.**
  `cercle-sectionswitch` (Famille/Social/Notes/Business/Carnets, `Cercle.tsx:610-625`) side-
  scrolls at 320–360px **and** carries `role="tablist"`/`role="tab"` with no roving tabindex /
  arrow keys / `aria-controls`. Migrate to the shared **`SubTabs`** (help- + keyboard-aware),
  already used for the view switch.
- [ ] **[dir] Three `Member` shapes converge on the ONE face control.** camelCase cercle
  `Member` (`cercle.ts:49`), snake_case `/api/members` rows (board/MemberSwitcher consume raw),
  and the detail adapter's own `Member` (`adapters.ts:30`). Cercle feeds `MemberSwitcher`/
  `FaceSelect` from shape 1 (`Cercle.tsx:707`), the board from shape 2 — a field rename on
  either side silently breaks one caller. No live bug found; introduce a shared `Face` type /
  `facesFromMembers` adapter so the seam is explicit.
- [x] **[dir] Verify member edits invalidate `CERCLE_KEY`.** The cercle page's faces/colours
  come from `/api/cercle`, not `MEMBERS_KEY`; if the member-PATCH write path (Settings ▸
  Maisonnée) doesn't list `CERCLE_KEY` in `affectedKeys` (or map it via realtime `keysForPath`),
  a renamed/recoloured face goes stale in the cercle until an unrelated poll. _(cross-link seam.)_
- [ ] **[nte] The full-screen `NoteEditor` is NOT bound to the visual viewport above the
  keyboard.** `.note-editor` is `position:fixed; inset:0` with no `.kb-open`/`--vvh` handling
  (`cercle.css:1903`), unlike `.recipe-modal` — so on a phone with the keyboard up, the bottom
  attach buttons + lower body sit **behind** the keyboard. Directly violates the standing
  "editor above the keyboard" rule. Pin to `var(--vvh)` under `.kb-open`.
- [x] **[frm] `FamilyBuilder` defines `Chip`/`PetChip` components inside the render body**
  (`:320,341`) → a new component type every render → React remounts the whole chip subtree,
  churning DnD/focus. Hoist them or inline the JSX.
- [x] **[frm] `ContactForm` hand-rolls an inline group-create** (name + kind `<select>`, no
  colour, `:559-585`) instead of reusing the shared **`GroupForm`** — the exact build-by-reuse
  failure mode.
- [x] **[nte] Two parallel Markdown implementations with copy-pasted regexes** —
  `lib/noteMarkdown.tsx` (render) and `lib/noteHtml.ts` (editor) each re-declare identical
  `HEAD_RE/CHECK_RE/BULLET_RE/…` + inline bold/italic parsing. Render-vs-edit split is fine,
  but share the grammar constants in one module (a marker tweak in one silently breaks
  round-trip fidelity with the other).
- [ ] **[nte] `NoteEditor` auto-save is entirely silent** (`:119`) — no "enregistré" cue, and
  offline the write queues invisibly. Consider a commit toast.
- [ ] **[crn] Carnet-scoped Entretien rows are add-only from the carnet scene** (read-only
  text, `CercleCarnetPage.tsx:374`) while care-log and pins both get `RowActions` — to edit/
  delete a carnet's upkeep row the user must leave to Réglages ▸ Corvées. Wire `RowActions` →
  `HomeProjectForm` + delete.
- [ ] **[frm] `ConnectPeople` comboboxes omit `typeaheadOnly`** (`:104,137`) — every other
  cercle combobox sets it; invites free-text that resolves to nothing (a dead input, though
  save is gated on picked keys).
- [ ] **e2e — the whole section is screenshots-only.** `cercle-visual`/`scenes` shoot
  section×view×theme×format but assert nothing and drive no interaction. **Zero** behavioural
  coverage for: group CRUD, the ＋ chooser (connect/group/business/carnet), drag-to-group +
  undo, ReviewChecklist apply, .vcf import, **Businesses** (no spec at all), note autosave
  round-trip / re-scope / media attach, the **carnet scene** (CRUD/care-log/pin/archive/doc
  lifecycle — highest-risk R2/undo seams, no coverage), and the toddler `CircleKidView` /
  world tour. Add write-path smoke tests, prioritizing carnet + businesses + ReviewChecklist.

### Findings — P3 (bigger / judgement)

- [ ] **[dir] Focus lens is `useState`, not URL state** (`Cercle.tsx:178`) — should ride
  `?focus=` per the subtab-URL rule (survives scene round-trips + deep-links); it also renders
  in Social where it collapses most rows to "aucun lien connu" (`:706`), and clearing it
  doesn't re-centre the ego view (`CercleEgo.tsx:45`).
- [ ] **[dir] Two independent "upcoming birthday" derivations + two `parseBirthday`** — client
  `cercle.ts:850` (`\d{1,4}`, ≤31-day window) vs server `_lib/birthdays.ts:33` (`\d{4}`) driving
  the board. Different regex/window for one concept → drift (a 1–3-digit stored year shows on
  the cercle page but is dropped by the board). Unify.
- [ ] **[dir] Four hand-rolled Union-Find copies** (`detectFamilyGroups`, `closedLinks`,
  `CercleWeb`, `CercleTree`) — extract one `unionFind` helper. And `relationsOf`/`relationTo`
  are pure but live in `Cercle.tsx:116/138` — move to `cercle.ts` for unit tests + reuse.
- [x] **[dir/crn] Cold non-401 fetch error reads as an empty circle/map, not an error**
  — ✅ **Fixed 2026-07-02**: added a shared `LoadError` fallback (`components/Fallback.tsx`,
  `role="alert"` + `t.common.loadFailed`) and both `Cercle.tsx` + `CercleWorldPage.tsx` now
  return it on `error && !data` (a stale-but-good poll still renders — kept over the error).
- [ ] **[dir/crn] `role="img"` world SVG with interactive `role="button"` descendants**
  (`CercleConstellation.tsx:260`) can collapse the subtree for AT, hiding the focusable islands/
  faces; and the per-island **people count** (`peopleN`, `:299`) is the one surfaced number —
  calm gut-check against the chore-ledger "faces not counts" rule.
- [ ] **[crn] `foreignObject`-wrapped `<Avatar>` per face in the world SVG** (`:315`) — long
  history of iOS-Safari render/hit-test bugs; real-device check on a large family (no e2e).
- [ ] **[frm] Small reuse/consistency nits:** `LinkComposer` hand-parses the person key instead
  of `parsePersonKey` (`:122`); `ContactForm` avatar posts via `api()` directly while
  `ContactPhotos` uses `useMediaUpload()` (`:260` vs `:38`); `ContactPhotos` query key is an
  inline literal not in `queryKeys.ts`; pet weight log has no edit + no same-date dedupe
  (`PetForm.tsx:129`); `cf__addr-row` packs city+province+postal tight at 320px.
- [ ] **[nte] Small nits:** `firstLine()` exported but `CercleNotes` recomputes it inline
  (`:227`); latent **orphaned-R2 blobs on in-editor replace/discard** (NoteEditor uploads
  immediately on pick — same class as the Voyage memo caveat); contentEditable body always
  labelled `fn.editorNew` even in edit mode (`:441`); audio-note edit is title-only.
- [x] **[crn] `HomeProjectForm`/`CareLogForm` invalidate `['carnets']` as an inline literal**
  (`:76`/`:94`) instead of importing `CARNETS_KEY`.
- [x] **[dir] EN gender-label maps omit `in_law`/`step_family`** — ✅ **Fixed 2026-07-02**:
  added `in_law: 'In-law'` / `step_family: 'Step-family'` to `FEM_EN`/`MASC_EN`
  (`cercle.ts`), so the maps are symmetric with FR. (No visible behaviour change — both
  fell to the same neutral via `relLabel` — but the maps no longer read as EN-incomplete.)

**Strengths to keep.** Closure never invents a precise rung (generic `relative` fallback) and
never guesses gender; a pet can never become a grandparent (`relationshipPickerGroups` + type
resets). `home_projects` is the ONE table shared with Corvées (carnet link via a guarded
FK-less `carnet_id`). `NoteEditor` is genuinely reused (add+edit, not forked from the board
memo). Care-log/pin deletes use `useDeferredRemoval` so R2 isn't freed until the undo lapses.
Media invariant + R2-free verified on cercle photos, carnet docs, and note attachments.

---

## 4. Share-links & inbound (the privacy boundary)

**Files.** `operator/guest.tsx` (issue links) · landings `/handoff` (sitter), `/welcome`
(visitor), `/family` (grandparents' window), `/intake`, `/courrier` (postbox) · reviews
`operator/IntakeReview.tsx` + `operator/PostboxReview.tsx` · scope allowlist
`functions/_lib/guestScope.ts`.

**Current state.** Typed read-only guest links via ONE token + `kind`, each with a per-kind
**path allowlist** = the privacy boundary. Two *writable* inbound kinds (intake, postbox)
land quarantined → operator accepts in Settings → surfaces as a cercle card / board note.

**Cross-links to close.**
- Accepted intake/postbox → **Le cercle** + **Board notes** (name-match tint). Review the accept path with §3.
- Read-only projections (`/family`, `/handoff`, `/welcome`, `/cast`) reuse Board/cercle data — check they honour the allowlist and don't leak writes.

**Verdict (2026-07-01).** Two security-weighted reviewers. **The core boundary is genuinely
robust** — the write-block is structural + defense-in-depth (`authed()` 403s any guest non-GET
unless kind ∈ {intake,postbox}, AND a per-kind default-deny path allowlist), the kind is bound
into the signed token (can't widen `sitter`→`family` via URL), quarantine rows never touch a
live table, the postbox tint is applied **server-side** so the reviewer's face never leaks, and
XSS is clean (escaped JSX, no `dangerouslySetInnerHTML`). **This section carries the pass's
first real SECURITY findings** — all in the "one open link shared to many relatives" model:
statelessness (no revoke), no rate-limit, a UI-only field-scope bitmask, and an over-sharing
default kind. These deserve priority in the implement phase.

### Findings — P1 (SECURITY / high-value)

- [x] **🔒 Field-scope bitmask is NOT enforced server-side.** `guest/intake-submit.ts:21`
  → `sanitizeIntake()` never reads `actor.guestFields`; the scope gates only the **UI**
  (`IntakeForm.tsx:143`) + greeting. A crafted POST can submit household/pets/address/photos on
  a name-only link. Bounded (quarantined, operator reviews) but the bitmask is currently
  cosmetic. **Fix:** pass `guestFields` into `sanitizeIntake` and drop out-of-scope sections.
- [ ] **🔒 No rate-limit + no revoke on stateless guest writes.** `intake-submit`,
  `postbox-submit`, and both `*-media` (3 MB each) have zero throttle; guest validity is "the
  signed expiry alone, no DB row" (`household.ts:80`) → **no revoke-before-TTL**. A leaked/
  broadly-shared link allows unbounded quarantine-row + R2 flooding until the 7-day sweep, and
  the operator can't kill it early. **Fix:** a `guests` row (like `devices.revoked_at`) + a
  per-token submission/upload cap. _(Same revoke gap makes `showcase` below worse.)_

### Findings — P2 (SECURITY + design)

- [ ] **🔒 `showcase` over-shares, is the DEFAULT kind, long-lived, unrevocable.**
  `guestScope.ts:13` gives showcase read of **everything** except `home-pins`/`care-log` — an
  ad-hoc 2-path denylist that still exposes full `cercle` (relatives' phones/addresses/
  birthdays), all `photos`, `notes`, `trips`, `carnets`, `members` (real family PII). It's
  pre-selected in the issuer (`guest.tsx:121`), offers 7-day TTL, no revoke. Footgun: an
  operator pastes a "Démo" link publicly and leaks the household. **Fix:** narrow showcase to a
  curated subset, and/or don't default to it + cap its TTL + inline warning.
- [x] **🔒 Tint-hijack / impersonation by exact-name match is unwarned in review.**
  `postbox.ts:99` tints an accepted note to a member when `sender_name` == a member's
  `display_name` (case-insensitive) and stamps `— <name>`; a sender can type an existing
  member's name to spoof that face. Operator-gated (the intended DB-5 tradeoff) but
  `PostboxReview.tsx` shows the raw name with **no "will post as member X" cue**. Surface the
  matched face in the review row before accept.
- [x] **🔒 Submitted `media_key` is shape-validated, not ownership-checked** — ✅ **Fixed
  2026-07-02.** New `ownedStagedKeys()` (`_lib/stagedMedia.ts`) confirms each submitted key is
  genuinely `'staged'` for this household + kind + **guest** before it's accepted; `postbox-submit`
  drops an unowned attachment (whole thing if the media blob itself is foreign, else just the
  scene) and `intake-submit` nulls unowned photoKeys via the pure `redactUnownedIntakeMedia()`
  (unit-tested). A crafted POST can no longer smuggle an arbitrary/guessed R2 key onto a real
  entity at accept.
- [x] **No distinct "this link expired" state on any guest scene.** — ✅ **Fixed 2026-07-02.**
  New shared `GuestExpired` component (DevKit + COMPONENTS.md); `HandoffPage`/`WelcomePage`/
  `FamilyWindowPage` now read `isError` and render it on a `guest/window` failure (with
  `retry: skip-on-401/403` so the expired state surfaces fast, not after 3 retries). Locked by
  `e2e/guest-scenes.spec.ts` (expired → GuestExpired on all three; valid → content).
- [x] **Postbox FORKS `MemoControls`** — ✅ **Fixed 2026-07-02.** `MemoControls` gained a **STAGE
  mode** (`onStaged` hands back the uploaded R2 key instead of POSTing a note; `mediaEndpoint` +
  `withPhoto` + `recordLabel`/`photoLabel`/`drawDraftId` props), so Postbox drops its inline
  MediaRecorder + stage + Record/Draw/Photo trio + DrawPad (~130 lines) and renders
  `<MemoControls mediaEndpoint="guest/postbox-media" onStaged={setDraft} withPhoto …>`, keeping only
  its own name/text/draft-preview/submit. POST mode (board + CercleNotes) is byte-for-byte unchanged;
  the shared upload now routes through the canonical `uploadMedia`. Locked by `e2e/postbox.spec.ts`
  (text-only + photo-staged send) + the board fridge-note/drawings specs stay green.
- [ ] **Operator can't edit incoming values before accepting** (`IntakeReview` merge-or-create
  only, `:280`; PostboxReview posts text as-is) — a typo'd relative name can't be fixed pre-merge.
- [x] **Mic-denied is silent** — ✅ **Fixed 2026-07-02.** Now handled in the shared `MemoControls`
  (which Postbox delegates to after the theme-6 refactor, so the board memo path gets it too): a
  `getUserMedia` rejection sets `micDenied` → a `StatusMessage` (`t.memo.micDenied`, FR/EN), instead
  of the silent swallow. A written note still works.
- [ ] **Review-queue count in the section title** — `IntakeReview.tsx:226`/`PostboxReview.tsx:69`
  render `reviewPending(n)` ("N fiches à réviser"). Borderline against the "no unread counts"
  tenet; operator-only, passive, no nav badge/push, hidden at zero → borderline-acceptable.
  _(Marc's call: keep, or drop the number for strict compliance.)_
- [ ] **e2e — zero coverage of any guest flow.** No spec touches intake/postbox/courrier or the
  guest scenes; `guestScope.test.ts` doesn't even assert showcase is **blocked** from
  `home-pins`/`care-log` (the one denylist branch is untested). Add: a showcase-denies-unit case,
  a curated-kind-403'd-off-scope assertion, an intake+postbox submit→review→accept e2e, and an
  expired-token render.

### Findings — P3 (SECURITY hardening + nits)

- [x] **🔒 `/api/live` (realtime WS) bypasses the per-kind allowlist** (`worker/index.ts:116`) —
  a curated `sitter`/`family` guest can open the household socket and receive `invalidate` nudges
  naming keys across the whole household (write-activity **metadata/timing**, no row data — the
  refetch 403s), and hold a DO connection. Gate `/api/live` for curated guests.
- [x] **🔒 `showcase` allowlist is not write-aware** (`guestKindAllows('showcase','…intake-
  submit')` returns true, `guestScope.ts:19`) — writes are stopped only by `authed()`, so the
  allowlist loses its default-deny property for showcase. And **`postbox-media` accepts any
  content-type** (`accept:()=>true`, `:37`) where `intake-media` guards `image/` — mirror the
  guard. `/api/img/<key>` is not household-scoped (accepted capability model — note only).
- [ ] **Guest "done" state is client-only → duplicate pending rows on refresh/resubmit**
  (`IntakeForm.tsx:216`, `Postbox.tsx:188` — no submit idempotency).
- [ ] **Nits:** `INTAKE_KEY`/`POSTBOX_KEY` are page-local literals not in `queryKeys.ts`; the
  guest scenes hand-roll `scene__head` instead of `SceneHead` (deliberate — terminal scenes, no
  close); WifiBlock prints the full password as button text (overflow at 320px); family/pin
  photos `alt=""` (decorative — SR users get nothing).

**Strengths to keep.** Two independent write-block layers (a slip in one caught by the other);
signed-kind can't be widened via URL; quarantine integrity (pending rows never live; tint applied
server-side); token stripped from URL before render + fails closed on expiry; writable kinds
tightly cross-pinned (intake can't hit postbox paths); `staged_media` (mig 0091) unifies the media
tables; `/cast` renders the real `<Board/>` with `pointer-events:none` (no forked read-only layout).

---

## 5. Settings / Réglages (nine sections)

**File.** `src/pages/Operator.tsx` — `SECTIONS`: `guide · household · devices · agenda ·
chores · recipes · shopping · display · ai`. Bodies in `src/components/operator/*`.

**Approach.** Most sub-sections were touched with the surface they drive in §1–§4. Here,
sweep the **remainder** and the section as a whole (nav, deep-links `/settings?tab=`,
operator-only gating, guest read-only). Per sub-section 1:1 map:

| Settings section | Drives | Review with |
| --- | --- | --- |
| household (members, cercle groups) | Board faces, Le cercle | §3 |
| devices (pairing, guest) | kiosks, share-links | §4 |
| agenda (events, cars, schedule) | Board (events + L'auto + work on Le fil) | §0/§7 |
| chores (chores, routines, todo-templates) | Board, Routines | §2 |
| recipes (tags, pills, measure colours, slots, réserve) | Kitchen | §1 |
| shopping (shop, aisles, stores, history, ghost) | Liste | §1 |
| display (display, board layout, ambient, photos, voice, calm) | Board render, read-aloud | §8 |
| ai (this-week, recap, AI, build info, idle debug, mic, AI errors) | AI features, debug | §8 |
| guide (guide, section guide) | the in-app manual | keep in sync as we go |

**Verdict (2026-07-01).** Three reviewers swept the remainder (shell + guide + members +
devices; agenda + chores/rotation + todos; display + système). **Mature and reuse-disciplined**
— every body wraps `OperatorSection`, the rotation/recurrence engine is DST/leap/who's-next
correct **and** well unit-tested, the chore-ledger + "Cette semaine" honour faces-not-counts
rigorously, AI-off truly gates, photo R2 lifecycle is correct, board-layout store is properly
reused. **One confirmed real bug** (the CERCLE_KEY seam §3 flagged), plus a recurring a11y gap
(incomplete tablist / missing `aria-pressed`), sub-44px targets, and screenshots-only e2e.

### Findings — P1 (real bug / high-value)

- [x] **Member CRUD never invalidates `CERCLE_KEY` → Le cercle goes stale.** ✅ **DONE (Batch A)**
  — added `CERCLE_KEY` to all four member writes in `household.tsx` (add/delete/clearPhoto/save)
  and to `Operator.tsx` `load()`. A rename/recolour/delete now refreshes Le cercle at once (and
  the realtime push, since the client `affectedKeys` drive it). _(The deeper 3-Member-shape
  `Face` type unification remains — Batch E.)_

### Findings — P2 (small design pass)

- [x] **Settings tablist ARIA is incomplete** (`Operator.tsx:307-322`) — `role="tablist"`/`tab`/
  `aria-selected` present but no `id`/`aria-controls`, the single `role="tabpanel"` has no
  `aria-labelledby`, and there's no roving-tabindex / arrow-key nav. SR users get "tab"
  semantics without the wiring.
- [x] **`aria-pressed` missing on toggle-button pickers** — rotation picker (`ChoreForm.tsx:139`),
  schedule member + interval pickers (`schedule.tsx:199,232`) signal selection by class only, so
  a screen reader can't tell what's selected.
- [x] **The on/off "pill" `Toggle` is implemented twice** — a local `Toggle` in `ambient.tsx:17`
  vs `display.tsx` hand-inlining the same pattern ~6× (`:139-194`). Extract one shared primitive
  (+ DevKit) and reuse — the build-beside-existing pattern.
- [x] **Photo-delete button is 28×28px** (`photos.css:49`), a corner overlay on a wall tablet —
  the hardest place to hit a sub-44px target. Enlarge the hit-area.
- [x] **Schedule-block DELETE is a one-tap with no undo/confirm** — ✅ **Fixed 2026-07-02**:
  `ScheduleSection.remove` now routes through `useDeferredRemoval(SCHEDULE_KEY)` (the
  correct pattern for this live-polled list — hides + holds behind the undo toast, no
  poll flash-back), matching every destructive sibling.
- [ ] **Failed member add is silent** (`household.tsx:47` — catch keeps the name, no feedback),
  unlike `ClaimTablet` which surfaces `err`. Add a `StatusMessage`.
- [ ] **Pairing nits:** `ClaimTablet` success banner never clears (`devices.tsx:70`) and it writes
  via `api()` not `useWrite()` with no `useOnline()` gate/justifying comment (`:34`).
- [ ] **Phone settings nav** is a wrapping chip row **plus** a second wrapping `OperatorJump` row,
  with no active-tab-scroll-into-view on deep-link (`Operator.tsx:307`) — can push content far down
  at 320px. Verify against the overflow guard.
- [ ] **e2e gaps:** stale section ids in `settings-sections.spec.ts:10` (retired ids alias to hosts
  → duplicate screenshots under different filenames); **no** device-revoke / member-delete-rename
  round-trip; untested config sub-panels (schedule, cars, todo-templates, home-projects
  Projets/Entretien, the chore ledger); `ThisWeek` render never **asserts** faces-not-counts; photo
  upload+delete+undo only smoke-rendered.

### Findings — P3 (bigger / judgement)

- [ ] **Réglages writes via `api()` not `useWrite()`** — photo delete (`media.tsx:104`), AI toggle
  (`ai.ts:46`), ai-errors delete (`:108`); consistent with the app-wide Réglages-online-only
  pattern but a documented deviation from the `useWrite` rule. Decide: gate on `useOnline()` or
  annotate the exception.
- [ ] **Latent flash-back edge:** `DayPlanPage` reads `EVENTS_KEY`/`CHORES_KEY` **live**; a
  RealtimeHub `invalidate` on another device mid-undo-window could resurrect a row deleted in
  Réglages (the shell's own queries aren't live, so it's safe there). The row snapshot mitigates
  but doesn't prevent.
- [~] **First-paint flashes:** ✅ Photos guarded on `isPending` 2026-07-02 (Phase 0, `media.tsx:112`)
  so "noPhotos" no longer flashes before the grid. _Still open:_ `ThisWeek` has no error state (a
  failed fetch reads as an empty week, `:94`).
- [ ] **`AiStatusTest` ("Tester l'IA") shows even when the household turned AI off** (`aiErrors.tsx:
  35`) — it probes the binding, not the household switch; add a clarifying hint.
- [ ] **Reuse candidates:** `OperatorJump` not registered in DevKit; `ItemReorder` (`todos.tsx:260`)
  hand-copies EditField's reorder buttons; `ChoreForm`/`BlockForm` hand-roll the same member-toggle
  row (a candidate shared `MemberToggleRow`); `DeviceRow` hand-rolls optimistic rename vs
  `HouseholdListSection`.
- [ ] **Smaller nits:** schedule "add" disabled with 0 members but no hint (`schedule.tsx:139`);
  todo-template delete+undo re-creates with a **new id** → dangling refs (documented, low harm);
  `ScheduleSection` row packs too much on one line at 320px; `THIS_WEEK_KEY` page-local, never
  invalidated by writes (recap won't refresh live); MicSelfTest textarea can overflow / lacks a
  programmatic label.

**Strengths to keep.** Rotation/recurrence engine (`_lib/recur.ts`) is local-midnight/DST-safe,
Feb-29 leap intentional, who's-next can't index out of range — all unit-tested incl. the
spring-forward regression. `home_projects` is ONE `kind`-filtered table (plan|upkeep); the two
todo concepts stay distinct (tables/keys/files). The deferred-removal split is correct (shell
queries not live → `undoableRemove`; `todos` live → compensating re-create). `TAB_ALIAS` +
`SETTINGS_CARD_ALIAS` fold all retired deep-links gracefully. Kiosk gating enforced UI + server
(`authed('operator')`).

---

## 6. Capture / ＋ Add sheet & add-form scenes

**Files.** `components/AddSheet.tsx` + `lib/addSheet.tsx` (`SECTION_MODES`) · the capture
spine `POST /api/capture` (`functions/_lib/ai.ts`) · forms `forms/EventForm.tsx` +
scenes `/event/new`, `/chore/new`, `/home-project/new`, `/routine/new`.

**Current state.** The ＋ FAB specializes per section; capture type-or-speak → AI routes to
event/task/list-item/pantry-low/meal/leftover/note; degrades to a manual 7-type picker when
AI unset. Operator-grade tiles hidden from guest/kiosk.

**Review focus.** One entry point writing into §0–§3 — verify each mode lands in the right
place, degrade path is lossless, operator gating holds, and the unified `EventForm`
(Trajet + À apporter) is exercised.

**Verdict (2026-07-01).** Two reviewers. **Mature and well-reasoned** — the AI-degrade path is
airtight (AI-unset/503/bad-JSON → `{type:'note'}`, the row is always inserted; reroute is a
server MOVE so a correction never duplicates), the classifier is hardened by scar tissue (model
pinned + `extractJson` accepts parsed-or-string + `X-AI-Error` surfacing), primitive reuse is
strong, operator gating is defense-in-depth, and the scenes size to `--vvh` above the keyboard.
The real gaps: **capture is the one write that skips the outbox and swallows errors** (the lone
hole in "never lost"), the **inline bring-list draft can be silently discarded**, an EventForm
date/time **mislabel**, and thin/half-closed e2e on the load-bearing degrade + event-form paths.

### Findings — P2 (small design pass)

- [x] **Capture skips `useWrite()` and swallows errors — the one hole in "never lost."**
  `AddSheet.submit` calls `api('capture', …)` directly (`AddSheet.tsx:509`) and the catch
  swallows every `ApiError` with no toast (`:526`). Offline or on any 5xx the tap is a **silent
  no-op** — no outbox replay, no error surfaced (every other add here uses `write()`). Capture
  needs the sync response (type + reroute cleanup) so a full outbox may not fit — but at minimum
  gate the button on `useOnline()` **and** surface a failure notice so an offline capture isn't
  quietly eaten.
- [x] **Inline bring-list draft is silently discarded on submit.** If the operator types bring
  items but submits the event *without* clicking « Créer la liste », `bringDraft` is dropped and
  `bringTemplateId` stays null with no warning (`EventForm.tsx:135-153,354`). On submit, auto-
  create from the draft or block with a hint.
- [ ] **`createBringList` failure is fully silent** (`EventForm.tsx:148` — catch keeps the draft,
  no `StatusMessage`), and it POSTs via `api()` not `useWrite()` (online-only; semi-justified
  since it needs `res.id` synchronously to auto-select, which a queued `useWrite` returns null —
  but comment it + disable « Créer la liste » via `useOnline()`).
- [x] **EventForm date/time inputs are mislabelled.** The `<input type="date">` has **no**
  aria-label/visible label (`EventForm.tsx:224`); the time input's aria-label is `eventAllDay`
  ("Toute la journée") — wrong for a time field (`:230`). Contrast ChoreForm/HomeProjectForm,
  which wrap dates in a labelled `.recur__row`. Give the date a label + relabel the time.
- [ ] **e2e — the load-bearing paths are uncovered/half-covered.** No test for the **AI-off →
  degraded → manual 7-type picker** nor the **"Non, plutôt…" reroute** (the capture-never-lost
  guarantee). The event-form e2e (`screenshots.spec.ts:150`) asserts « Trajet »/« À apporter »
  render + types one bring item, but **never clicks « Créer la liste », never verifies auto-
  select, never submits** — so draft-discard/auto-select stay untested and `AUJOURDHUI.md:131`'s
  `[ ] Unified event form` is only half-closed (reconcile it). Also no create round-trip for
  ChoreForm/HomeProjectForm, no Trajet persist-on-edit.

### Findings — P3 (bigger / judgement)

- [ ] **Query-key + invalidation gaps in capture:** `submitList` invalidates `['ghosts']`/
  `['list-history']` as inline literals (`AddSheet.tsx:544`, same un-shared keys as §1);
  `MONTH_KEY` is **not** in `CAPTURE_KEYS`, so a captured event/meal won't reconcile an open
  month/day page until its poll; event/task/meal titles are **unclamped** (only the `note` path
  clamps to 280, `capture.ts:214`) — a long capture bloats the board payload.
- [x] **`aria-pressed` missing on the toggle chips** — EventForm member/car/passenger/template +
  ChoreForm rotation (`EventForm.tsx:234-351`) convey selection visually only. _(Recurring theme
  with §5's picker `aria-pressed` gap — batch them.)_
- [ ] **Small consistency nits:** reroute 7-up grid overflow untested at 320px; dead i18n key
  `t.capture.pickType`; `HomeProjectForm` title is a bare `<input>` where Event/Chore use
  `EditField`; redundant page-level invalidates (belt-and-suspenders over the form's own
  `affectedKeys`); `RecurPicker` is a documented parallel shape to server `recur` (latent drift);
  the "EventForm → Le fil" link is unverified (events likely derive from BOARD/EVENTS — confirm).

**Strengths to keep.** AI-degrade never drops words (row always inserted, degraded note
auto-cleaned on first real pick); reroute is a server MOVE (delete-then-insert, no dup);
classifier hardened (pinned `llama-3.3-70b-fp8-fast` + dual-mode `extractJson` + `X-AI-Error`
toast); heavy reuse (`Sheet`/`useModal`/`useSwipeToDismiss`, `VoiceButton`, `EntityCombobox`,
`Disclosure`, `RecurPicker`, `LeadPicker`, `todo_templates` for bring-lists — not forked);
operator gating is UI + server; the sheet never auto-opens the keyboard; scenes size to `--vvh`;
`LeadPicker` is additive-only (never pushes an item earlier).

---

## 7. Cross-cutting full-screen scenes

**Cook** (`/kitchen/recipe/:id/cook`, `CookMode`) · **Cashier** (`/liste/cashier`) · **Cast**
(`/cast` read-only board to TV) · **Search** (`/search` global) · **Moment**
(`/moment` recap by window) · **Departure** (`/board/departure`) · **Voyage** (`/voyage/*`)
· **Circulaires / Deals / Price-match** (`/liste/circulaires`, `/liste/deals/:id`).

**Review focus.** Each is a projection of §1–§3 data. Check scene-close conventions
(`useSceneClose`/`useEscapeKey`), audience-following (Cook/Cashier), read-only honesty
(Cast/Family), and that Search reaches every entity (people, pets, businesses, recipes,
list, events).

**Verdict (2026-07-01).** Two reviewers (Search/Moment/Departure; Voyage/Jouer/Drawings).
Cook/Cashier/Cast/flyers already covered in §1/§4. **Mostly solid** — the Moment `?scope=`
round-trip is correct + e2e-covered, Search reuses shared primitives and *does* ingest cercle
people/pets/businesses (answers §3's open question), calm is clean (games have no score,
packing no "n of m"), reuse is strong. **Two real bugs in Voyage** (a confirmed freed-blob
resurrection + a missing delete UI), plus Search coverage/loading gaps and Voyage's total e2e
absence.

### Findings — P1 (real bug / high-value)

- [x] **Voyage Infos/Itinéraire media notes: undo-after-delete resurrects a row pointing at a
  FREED R2 blob.** `VoyageInfos.del` (`VoyageInfos.tsx:37`) + `VoyageItinerary.del`
  (`VoyageItinerary.tsx:61`) DELETE then `recordUndo` with a re-POST carrying the same
  `media_key`/`scene_key`, but `trip-notes` DELETE **unconditionally frees** both blobs
  (`trip-notes.ts:179`). So an audio/drawing/photo note: delete → blob gone → undo re-creates the
  row → `media_key` 404s (broken audio/image). **Confirmed live in two files** (the memory'd
  caveat). Fix: for notes with `media_kind` set, use `useConfirm` (no undo) like Documents/gallery
  already do; keep the undo path only for text-only notes.
- [x] **No trip-delete affordance anywhere in the UI.** `trips.ts:143` implements DELETE (soft-
  delete + cascade trip_notes/packing + free cover blob) but grep finds **zero callers** in `src/`
  — a trip can be created and edited but never removed. Dead endpoint + real dead-end. Add a
  confirm-gated operator delete to `VoyageForm`/the scene foot.

### Findings — P2 (small design pass)

- [ ] **Global Search does NOT reach every entity — carnets + home-projects gap.**
  `SearchPage.tsx:135` queries recipes/people/pets/businesses/notes/routines/todos/pantry/reserve/
  cars/events/list/fridge-notes/guide but **not `carnets`** (nor `care_log`/`home_pins`) or
  `home_projects`/drawings. Searching a car VIN or a home-project note returns nothing. _(This is
  the definitive answer to §3's "verify Search ingests everything": people/pets/businesses ✓,
  carnets/home-projects ✗.)_
- [x] **Search cold-load false "aucun résultat"** — ✅ **Already fixed** (verified 2026-07-02):
  `SearchPage.tsx:265` computes `fetching = useIsFetching()` and shows `t.search.searching` until the
  queries settle (`:341-348`), only then `noResults`. This box was stale; kept for the record.
- [ ] **Undated trips + dead cover-photo.** `VoyageCard`/`MonthView` only list trips with
  start+end (`VoyageCard.tsx:18`), and there's no trip-list surface, so an undated trip is
  unreachable after you close the scene. And `Trip.media_key` is read (`VoyageDocuments.tsx:80`) +
  PATCH-accepted but `VoyageForm` has no cover picker → write-only dead branch. Require dates (or
  surface undated trips) + wire or drop the cover.
- [ ] **e2e gaps:** **Voyage has ZERO coverage** — absent from `scenes.spec.ts`, no `trips`/
  `trip-notes`/`trip-packing` mocks, so the media-undo bug above sits untested; add mocks + a
  `/voyage/:id` entry + a delete-undo-media interaction spec. **Search has no functional test**
  (only the Ask button's visibility) — nothing asserts a query surfaces rows across sections.
  Departure's one write (ActivityBring "Ajouter à cocher") is untested; Jouer is screenshot-only.

### Findings — P3 (bigger / judgement)

- [ ] **Shared-primitive nits:** `capitalize` re-defined ×3 (`DeparturePage.tsx:28`,
  `MomentsView.tsx:75`, `DayPlanPage`) → promote to `lib/format`; Departure/Moment hand-roll
  empty/loading (`departure__empty`/`loading mono`) instead of `EmptyState`; gallery `['drawings']`
  key is local (`drawingGallery.ts:23`) not in `queryKeys.ts`; `DrawingGalleryPage` members query
  lacks `...live` (`:40`) unlike every other consumer.
- [ ] **a11y nits:** Search results region has no `aria-live`/`role=status` (SR users get no "N
  results" feedback); MomentPeek's four window chips risk sub-44px height in the height-matched
  hero card (`MomentPeek.tsx:35`).
- [ ] **UX nits:** business/family-note Search hits deep-link to the section **list**, not the
  item (`SearchPage.tsx:385/499`) — user must re-find the row; Voyage twin `type="date"` inputs +
  packing move-`<select>` unverified at 320px; trip "Bagages" doesn't reuse the shared
  `todo_template` bring-list (opportunity, not a bug).

**Strengths to keep.** Moment `?scope=` round-trip is correct end-to-end + e2e-covered; Search
ingests the cercle graph (people→`/cercle/person/:id`, pets, businesses, notes), caps at 8/section
by source order (no gamified rank); Documents + drawings-gallery delete correctly use confirm-not-
undo (the template the note tabs should adopt); DrawPad copies blobs independently (deleting one
never frees another); games have no score/fail/end (calm); heavy reuse (`SceneHead`/`SubTabs`/
`CarnetDocs`/`MemoControls`/`DrawPad`/`useDeferredRemoval`).

---

## 8. Ambient / idle / theming / offline / PWA (system-wide)

**Files.** `lib/ambient.ts` + `AmbientScreen` · idle in `HubLayout` (screensaver +
return-home drift) · `lib/timeofday.ts` + `lib/daypartDrift.ts` (day-part) · `BoardCanvas`
+ `lib/canvas`/`lib/season` · offline: `lib/persist.ts` + `lib/outbox.ts` + `useWrite`
(see [`OFFLINE.md`](./OFFLINE.md)) · PWA SW in `vite.config.ts`.

**Review focus.** Reviewed last, once surfaces are settled: opt-out toggles honoured,
reduced-motion safe, kiosk-reboot-offline works, day-part never overrides manual Night,
idle arms on every surface. Debug via **Réglages ▸ Système ▸ Debug**.

**Verdict (2026-07-01).** Two reviewers (ambient/idle/theming; offline/PWA/realtime). **The
resilience layer is mature and fail-safe** — the four-layer offline model (SW shell, persisted
cache, outbox, awareness) is complete, idempotency is correct, the cache restores before first
paint, a kiosk reboots offline, realtime is correctly an *optimization over* polling, and
day-part never overrides manual Night. Findings: an idle-cycle wake bug, a day-part restart
gap, a realtime `keysForPath` drift, a Durable Object hibernation miss, and the definitive
**app-wide `useWrite`-bypass verdict** (below).

### The `useWrite`-bypass verdict (app-wide — resolves a theme every section raised)

Migration is **~90% complete**, and crucially **the realtime broadcast fires server-side in
`authed()` on every successful write regardless of whether the client used `useWrite` or
`api()`** — so a bypass loses **only** the offline queue/replay, never realtime or poll-reconcile.
Excluding the legitimately online-only writes (**AI** needs a live response; **auth/pairing/guest/
device admin**; **blob/R2 uploads + their key-chained follow-up** — all correctly `api()`), the
real backlog is small:

- [x] **Genuine offline gaps to migrate to `useWrite`:** — ✅ **all closed** as of 2026-07-02.
  `DealsBrowser.addToList` + `stageDeal` (writeWith), `useRecipeShop.confirmShop`,
  `Kitchen.keepSuggestion`, `RoutinePlayer` (3 PATCHes), and `QuickAddPage` ghost-mute all
  route through `useWrite`/`writeWith` now.
- [~] **Household-settings inconsistency** (low value — rarely toggled offline): ✅
  `operator/meals.tsx` + `operator/shopping.tsx` migrated to `write()` (2026-07-02). Remaining
  on `api()`: `ai.ts:46`, `measurePrefs.ts:90` — genuinely rarely-offline operator config.

### Findings — P2 (small design pass)

- [x] **Realtime `keysForPath` drift — ~6 endpoints fell to the `[['board']]` default.**
  ✅ **DONE (Batch A)** — `functions/_lib/realtime.ts` now maps `recipe-loves`→`[['recipe-loves']]`,
  `businesses`, `family-notes`, `pets`→`[['cercle']]`, `schedule`/`car-day`→`+['board']`,
  `drawings`, mirroring each client `affectedKeys` (verified by grep); `/api/car` is GET-only so
  needs none. Added a **regression test** pinning all six + asserting none returns the bare board
  default. _(A full auto-completeness test cross-referencing `worker/routes.ts` — importing the
  handler table into a Functions-layer test — was deferred as higher-risk; the pin + guard covers
  the known drift. → Batch H.)_
- [ ] **Waking the screensaver by tap does NOT reset the shell idle cycle.** `AmbientScreen.wake`
  calls `stopPropagation()` (`AmbientScreen.tsx:100`) so HubLayout's window `pointerdown` reset
  (`HubLayout.tsx:207`) never fires — a pending return-home drift can still fire right after a
  wake tap, and the screensaver won't re-arm until the next interaction. Have `onWake` poke the
  shared re-arm.
- [ ] **Day-part auto-advance loop isn't restarted when enabled mid-session** — `startDaypartDrift()`
  is one-shot at boot and no-ops if drift was OFF then (`main.tsx:335`, `daypartDrift.ts:20`); a
  kiosk toggled ON mid-session shows the right tint now but won't advance dawn→…→night until reload.
- [ ] **Screensaver is default-ON and arms on mobile, but the help copy says "kiosk only"**
  (`i18n.ts:1948` `ambientNote` — also an unused/dead key). A phone operator gets a full-screen
  clock after 5 idle min with copy claiming it can't happen. Scope the default off for
  `surface==='mobile'` or fix the copy.
- [ ] **`RealtimeHub` doesn't use the WebSocket Hibernation API** — `server.accept()` + an in-memory
  `Set` (`worker/RealtimeHub.ts:43,31`); a 24/7 wall tablet holds an open socket so the DO never
  evicts from memory and is billed for continuous wall-clock — at odds with the free-tier focus.
  Switch to `state.acceptWebSocket()` (hibernatable) before flipping realtime fully on at scale.
  _(cross-ref project memory [[babillard-free-tier-capacity]].)_

### Findings — P3 (bigger / judgement)

- [ ] **Outbox head-of-line blocking:** one poisoned entry (persistent 5xx) `break`s the run and
  retries indefinitely with no max-attempt/dead-letter (`outbox.ts:113`), so everything queued
  behind a server-bug-500 op never lands. Add an attempt counter → dead-letter after N.
- [ ] **Pending-write count is invisible when `navigator.onLine` lies "online"** — `OfflineBanner`
  returns null when `online` (`:18`), but transport-failure writes still queue; surface
  `useOutboxCount()>0` regardless of `online`.
- [ ] **Voice input doesn't hold off idle** — the reset listens to `pointerdown`/`keydown` only
  (`HubLayout.tsx:207`), so a hands-free capture past `idleMin` can be covered by the screensaver /
  reattributed by drift.
- [ ] **Ambient reuse nits:** the on/off `Toggle` is hand-rolled twice (again — the §5 dup);
  `AmbientScreen` re-rolls a clock instead of the shared `useNow` (`:51`); the screensaver dialog
  takes no focus on mount so its own `onKeyDown` wake is dead code (wake works via the window
  listener) — a sighted keyboard user keeps an invisible focus ring behind the z-200 overlay.
- [ ] **e2e — no behavioural coverage of the whole layer.** Offline queue/replay/idempotency, the
  SW, the WS fan-out, and idle **wake/drift/warn-chip** + day-part drift are unit-tested only
  (OFFLINE.md relies on manual DevTools testing; `idleDebug` exists to make idle observable in
  seconds but no spec drives it). The `RealtimeHub` WS has no integration test.

**Strengths to keep.** Four-layer offline model is complete + fail-safe (queue→replay FIFO with
stored idempotency key; server dedup on `(household,key)`, 2xx-only, 7-day prune; cache restored
before `createRoot`; SW precaches the shell so a kiosk reboots offline). Realtime is correctly an
optimization — a dropped socket flips to fast poll, and the server broadcast is independent of the
client write path. Day-part drift is attribute-only so it never overwrites the operator's manual
Night; reduced-motion is honored everywhere; structural calm intact.

---

## Cross-link ledger (do-once shared work)

The seams where two sections meet — fix the seam **once**, from whichever section you reach
it first, and tick it here so the other section's pass doesn't reopen it.

| Seam | Between | Status |
| --- | --- | --- |
| Meal plan → Board "Ce soir" + day note | Kitchen → Board | [~] seam correct; **immediacy gap** — some today-writes omit `BOARD_KEY` (§1 P2) |
| Shop-the-week / running-low / recipe ingredients → La liste (`['board']`) | Kitchen → Liste | [~] seam sound; **offline gap** — `recipe-to-list` bypasses `useWrite` (§1 P2) + dead `['list']` invalidate (§1 P3) |
| Recipe → Routine round-trip | Kitchen → Routines | [x] verified (fresh `rcp_` media key, parent-only gate) |
| Aisle order / ghost / stores / history | Settings ▸ Magasinage → Liste | [x] round-trips; **e2e gap** (aisle-sort untested, §1 P1) + un-shared keys (§1 P3) |
| Recipe tags/pills/measure colours/slots/réserve | Settings ▸ Cuisine → Kitchen | [x] round-trips; measure-colour forks `ColorPicker` (§1 P2) |
| Member shape parity (3 Member shapes) + faces | Le cercle ↔ Settings ▸ Maisonnée ↔ Board | [x] ✅ **Batch A** — member CRUD now invalidates `CERCLE_KEY` (Le cercle no longer stale). Remaining: unify the 3 Member shapes behind one `Face` type (§3 P2 → Batch E). |
| Birthdays (derived) on Board "À venir" | Le cercle → Board | [~] works but **two independent derivations** (client cercle `\d{1,4}`/≤31d vs server `\d{4}`) → drift (§3 P3) |
| Carnets → Board `CarnetsCard` + Entretien rows | Le cercle → Board | [x] implemented correctly (shared `home_projects`, `useCarnets` off the board poll); carnet-scoped Entretien is add-only from the scene (§3 P2) |
| Intake/postbox accept → cercle card / board note (name-match tint) | Share-links → cercle/Board | [x] quarantine solid, tint server-side; **tint-hijack unwarned in review** + field-bitmask not server-enforced (§4 P1/P2) |
| Guest path allowlist honoured by every read-only projection | Share-links → Cast/Family/Handoff/Welcome | [x] projections honour it + can't write; **caveats:** `showcase` over-shares (§4 P2), `/api/live` bypasses the allowlist (§4 P3) |
| Capture modes land in the correct section + lossless AI-degrade | ＋ Add → Board/Kitchen/Routines/cercle | [x] AI-degrade airtight (row always inserted, reroute=MOVE); every intent lands. **But offline/5xx capture is silently lost** (skips outbox + swallows errors, §6 P2) |
| Global Search reaches every entity type | Search → all | [~] reaches people/pets/businesses/recipes/notes/list/events/routines/todos/pantry/cars ✓; **misses carnets + home-projects + drawings** (§7 P2); business/note hits land on the list not the item |
| Read-aloud/voice config consistent | Settings ▸ Voix → Routines/Liste/Kitchen toddler | [x] verified — `VoiceSection` (per-lang voice + rate) drives the shared `useSpeak`; recorded clip overrides TTS per card; recipe has a per-recipe `lang`, routines read in global lang (asymmetry noted, acceptable) |
