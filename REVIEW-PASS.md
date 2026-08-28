# REVIEW-PASS — a slow, section-by-section audit of the whole app

> 📍 **20 findings still open here** (P2/P3, section debt — no data loss). For where they
> rank against everything else in the repo, read [`STATE.md`](./STATE.md) § 4.
>
> **Swept 2026-08-28.** Every open box was grepped against code before anything was built.
> It said 29; **eight were already fixed and never ticked**, and one named a component that
> no longer exists (`OperatorJump`). Those are ticked above with the file:line that settles
> each. Two were fixed in the same pass (`NoteEditor`'s silent auto-save; `ItemReorder` →
> the shared `<Reorder>`). What is left below has been verified as genuinely open.
>
> **The rule this sweep exists to enforce: grep the claim in code first.** Between this
> file and `bmad/11`, thirteen "open" items in two days were already done — a ledger cell
> is a verdict from a moment, not a fact. And grep the *tree*, not just the place the
> finding points at: "`OperatorJump` is not in DevKit" was true and useless, because the
> component had been deleted. **Tick a box in the same commit that resolves it.**

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

## ▶ Next steps (updated 2026-07-03)

> Snapshot of the highest-value remaining work, so a fresh session has an entry point.
> **In flight (another session):** a **forms IA-hardening** pass — shared `FormFooter` +
> `MemberPicker` primitives (`522da34`), migrating every form (cercle forms, Chore/Event/
> HomeProject/Routine) onto them + disclosure, and RecipeSheet→`SceneHead`. **Don't touch
> `src/components/forms/*`, the cercle forms, `FormScene`, `RecipeSheet`, or `CookMode`
> while that runs** — coordinate or pick from a different area.
>
> 1. ✅ **Carnets e2e — DONE 2026-07-03** (`e2e/carnet-restore.spec.ts` + `carnet-scene.spec.ts`):
>    the two specs stub the carnets tree / care-log / home-pins per-test (voyage-style, no shared
>    mock fixtures needed) and drive archive→restore + the scene (both segments, tree→child nav,
>    history, confirm-then-DELETE). Was the last real e2e gap alongside capture (below) — both now closed.
> 2. ✅ **Capture AI-off degrade + reroute e2e — DONE 2026-07-03** (`e2e/capture-degraded.spec.ts`):
>    per-test stubs `POST /api/capture` to return `{ degraded: true }` (AI off → note) then a real
>    route on the forced re-file. Two specs assert (a) the degraded picker shows the 7 tiles OUTRIGHT
>    (no « Corriger » disclosure) with the text kept, and (b) tapping a tile re-POSTs with
>    `forceType` + `undo` = the note's rows, so the reroute MOVEs (never dupes). **The last real e2e
>    gap (§8 / theme-4) is now closed.**
> 3. **Routines §2 judgement calls (need Marc)** — nested-interactive parent-grid card (role=button
>    div w/ nested buttons → non-button `<article>` + explicit peek control = changes keyboard peek);
>    ~~dead `BOARD_KEY` invalidate on routine save~~ **dropped 2026-07-03** (`f2dcd6e` — the board
>    payload carries no routines); two-timers-on-screen; parent-overview "done today" asymmetry;
>    per-step countdown timer e2e (needs `page.clock`).
>
> **Larger, steer-first:** token revocation (needs a `guests` table — breaks the stateless-token
> model); `showcase` over-share TTL/narrowing; operator edit-before-accept in Intake/Postbox review.

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
4. **e2e is screenshots-only almost everywhere.** ✅ **Mostly closed** — behavioural specs now cover
   guest/intake/postbox, Voyage, Search, idle/offline/realtime/SW, and the carnet scene + restore
   (2026-07-03) and capture-degrade+reroute (`capture-degraded.spec`, 2026-07-03). **The behavioural
  e2e gaps are now closed** (item 2 above). The correctness-critical
   *logic* (recur, closure, idempotency, vcard) was already well unit-tested — it was the *flows*
   that were blind.
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
- **e2e backfill (mostly closed now):** ✅ **DONE** — guest scenes (`guest-scenes.spec`), intake
  both sides (`intake.spec`), postbox (`postbox.spec`), **Voyage** (`voyage.spec`, 7 tests), idle/
  ambient (`idle-ambient.spec`), the offline **outbox** (`offline-outbox.spec`), **realtime-WS +
  SW precache** (`realtime.spec` + `sw.spec`/`sw.config`, 2026-07-03 — §931 fully closed), and
  **carnet-restore + the carnet scene** (`carnet-restore.spec` + `carnet-scene.spec`, 7 tests,
  2026-07-03 — per-test stubs, no shared mock fixtures needed), and **capture AI-off degrade+reroute**
  (`capture-degraded.spec`, 2 tests, 2026-07-03 — the last one). ✅ **The 3 pre-existing failures are FIXED** (2026-07-02, d80cbe5 +
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
- **211** (Kitchen e2e) — cook-stepper + Vide-frigo covered; ✅ **config-PATCH now covered 2026-07-02** (`config-panels.spec.ts`: meal-slot hide → PATCH household{mealHidden}, réserve add → PATCH household{reserveLocations}). Still uncovered: suggestion cards / shop-the-week / list drag-reorder.
- **233** (Kitchen empty CTA) — recipe-book CTA added; `ToddlerCookBook` still shows a "0 recettes" dead cover.
- **303** (Routines step-editor e2e) — ✅ **closed 2026-07-02** (`routine-builder.spec.ts`): drives add/remove/reorder cards at `/routine/new` and asserts the POST body carries the deck in the edited order (the parallel-array alignment crux). Media (clip/photo upload) still not driven — needs a mock MediaRecorder/R2 stub.
- **424** (Cercle e2e) — `note-editor.spec` real behaviour added; ✅ **group/business/carnet CREATE now covered 2026-07-02** (`cercle-crud.spec.ts`). Still specless: ReviewChecklist apply, group DELETE/edit, drag-to-group.
- **442** (Cercle Union-Find) — unified into one `UnionFind` class; ✅ `relationsOf`/`relationTo` now moved to `lib/cercle.ts` (2026-07-02) so the page stays a view (`relPriority` dropped its now-internal `export`).
- **459** (NoteEditor nits) — orphan-blob fixed; ✅ body `aria-label` now `note ? editorEdit : editorNew` (2026-07-02). **Correction:** `firstLine` is NOT exported-only — it's used in `SearchPage.tsx:560` (the original claim was inaccurate). Remaining: audio-note edit still title-only.
- **509** (guest rate-limit/revoke) — ✅ **fully closed 2026-07-02**: per-token REVOKE (mig 0098 `guests` + `resolveActor` check + `guest-links` list/revoke + « Liens actifs » UI) AND per-token RATE-LIMIT (mig 0099 `use_count` + `chargeGuestUse` cap of 40, charged before any work in all 4 writable endpoints).
- **518** (showcase over-share) — ✅ **mitigated 2026-07-02**: issuer no longer defaults to showcase (now `sitter`, showcase moved last + caution glyph); warning + 24 h TTL already shipped. Read-scope kept broad by design (showcase = the real Démo hub; narrowing 403s whole tabs) — a curated Démo needs per-tab hiding, tracked separately. Revoke now shipped (§509) — a leaked showcase link CAN be killed early.
- **559 / 822 / 931** (e2e — guest / Voyage / offline-layer) — postbox + guest-scenes specs added; ✅ **§822 Voyage** now fully covered (`voyage.spec.ts`: create/view/add-note/pack/check/edit/delete, 7 tests) AND ✅ **§559 intake submit→review→accept** covered both sides (`intake.spec.ts`: guest fills+submits, operator reviews+accepts→merge, 2026-07-02). ✅ **§931 outbox** now covered too (`offline-outbox.spec.ts`: a `/liste` write made offline queues — offline-bar shows the pending count, nothing sent — then replays on the `online` event, 2026-07-02). ✅ **§931 idle/ambient** covered too (`idle-ambient.spec.ts`: the Debug `bb:idle-debug` force shows the screensaver + a tap wakes back to the board, 2026-07-03). ✅ **§931 realtime-WS + SW precache** now covered too (2026-07-03) — the last two, each on its own harness: `realtime.spec.ts` mocks the `RealtimeHub` DO with `page.routeWebSocket` (no wrangler/D1) and drives an `{type:invalidate}` frame → La liste refetches the board inside the 60s realtime heartbeat (proving push, not poll), plus a malformed-frame robustness case; `sw.spec.ts` + `e2e/sw.config.ts` build + `vite preview` the real PROD bundle (the SW is a build artifact, registers only in PROD), assert the versioned precache holds the shell, then go offline + reload and confirm the board still boots. Wired into `e2e.yml` as `npm run e2e:sw`; `testIgnore`'d from the default config. **§931 e2e now fully closed.**
- **668** (Settings error states) — ✅ **closed 2026-07-02**: `ThisWeekTogetherSection` now reads `isError` and shows `t.common.loadFailed` instead of a false empty week (only when no cached frame). Photos already guarded `isPending`.
- **729** (createBringList silent) — ✅ **closed 2026-07-02**: `EventForm.createBringList` catch now sets `bringErr` → `StatusMessage`; « Créer la liste » disabled + a « Indisponible hors-ligne » hint when `!useOnline()`.
- **747** (capture keys) — shared GHOSTS/HISTORY keys done; ✅ `MONTH_KEY` now in `CAPTURE_KEYS` (2026-07-02) so a captured dated event/task refreshes the month/day calendar. Remaining: event/task/meal titles still unclamped server-side.
- **808** (Search coverage) — ✅ **closed 2026-07-02**: `SearchPage` now also indexes `care_log` (title + note), `home_pins` (label + detail) and `drawings` (by author name — a drawing has no text of its own). Care-log/home-pins read the WHOLE household at once (no `?carnet=` → every row; `home-pins` GET gained that all-mode, mirroring `care-log`) under the bare `CARE_LOG_KEY`/`HOME_PINS_KEY`, distinct from the per-carnet caches. Care-log/pin hits deep-link to `/cercle/carnet/:id?seg=carnet`; drawings to `/drawings`. Covered by `e2e/search.spec.ts`.
- **830** (cross-cut nits) — ✅ **all closed 2026-07-02**: `capitalize` unified into `lib/format.ts`; `GALLERY_KEY` centralized as `DRAWINGS_KEY` + gallery members query gained `...live`; `DeparturePage` empty now uses the shared `<EmptyState>`.
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
- [x] **Toddler cook-mode exit leaks to the parent recipe sheet.** — ✅ **Fixed 2026-07-02**:
  `RecipeSheet`'s gate is now `ro = isGuest() || audience === 'toddler'`, so a toddler
  landing here after cooking no longer sees add-to-list / plan / edit / delete; the Share
  button (a guest-allowed read action) is additionally hidden for `audience === 'toddler'`
  (the OS share sheet is a chrome escape the one-way door must not open).
- [x] **`keepSuggestion` gives no feedback and double-adds.** `Kitchen.tsx:343-349` POSTs to
  `meal-ideas` but never clears/disables the card or toasts → tapping "Garder" twice inserts
  the idea twice. Clear-on-keep (+ the undo toast used elsewhere).
- [x] **Meal-row control cluster is sub-44px with up to 6 icon buttons.**
  `MealRows.tsx:141-203` (heart/book/↑/↓/leftover/trash); `.kitchen__meal-btn` min is
  **32px** (`kitchen.css:613`), below the 44px rule and cramped at 320–430px. Bump to 44px
  and/or fold reorder/leftover behind `RowActions`.
- [x] **Today's meal writes don't all invalidate `BOARD_KEY`** — ✅ **Fixed 2026-07-02**:
  `saveSlot`/`clearMeal`/`moveMeal`/`clearSlotMeals`/`clearDay`/`planRecipe` now pass
  `[MEALS_KEY, BOARD_KEY]`, so the board's "Ce soir" hero refreshes at once instead of
  lagging to the next poll (matching `renameMeal`/`planLeftover` which already did).
- [x] **`MeasureColorsSection` forks the colour UI.** — ✅ **Resolved 2026-07-02 as DELIBERATE**
  (the finding's own "unless the free-form picker is deliberate" branch). The measure defaults
  (`measureColors.ts`: leaf green / teal / golden yellow …) are matched to a household's PHYSICAL
  colour-coded spoons/cups and are **not** in the member `PALETTE`; `ColorPicker` would make it
  impossible to match a real spoon. Kept the free-form OS picker + added a code comment so it isn't
  re-flagged. (Not a fork to fix — a genuinely distinct requirement.)
- [x] **`HistorySection` delete has no confirm and no undo** — ✅ **Fixed 2026-07-02**:
  `remove` (`operator/shopping.tsx`) now hides the row locally + holds the DELETE behind the
  shared `useUndoToast` (deferred; onUndo reloads it back). Matches the list's undo idiom.
- [x] **`CashierPage` has no empty/error state** — ✅ **Fixed 2026-07-02**: a `hadPicks`
  ref distinguishes "emptied in-session → slip back to the list" (unchanged) from a cold
  deep-link that was never non-empty → now renders a `SceneHead` + `EmptyState`
  (`t.shop.cashierEmpty`, guide card `cashier`) instead of flashing Loading→blank→redirect.
- [x] **Restock / réserve adds don't refresh predictions.** — ✅ **Fixed 2026-07-02**:
  `PantryTab.checkLowItem` + `ReserveSection.addToList` now pass
  `[BOARD_KEY, GHOSTS_KEY, HISTORY_KEY]`, matching the canonical `Liste.postAdd`, so a
  low/reserve item drops out of the quick-add candidate set the moment it's listed.
- [ ] **Guest handling inconsistent across config panels.** Most render a read-only legend;
  `MeasureColorsSection` returns `null` (whole section vanishes, `display.tsx:477`). Prefer
  a uniform read-only legend.
- [~] **e2e blind spots** (beyond aisle-sort, P1) — the **cook-mode stepper is now covered**
  (✅ 2026-08-27, `e2e/cook-stepper.spec.ts`, 6 cases): forward/back with the counter following,
  the clamp at the last stage (a bad `Math.min` blanks the page rather than erroring), the
  **keyboard mirror** (ArrowLeft/Right — the standing "nothing touch-only" rule), the toddler
  **lock** (no « Affichage » switcher, because a pre-reader dropped into the ingredient wall has
  no way back and the kid lens has no in-app escape), the parent's switch away from the stepper
  and back, and the ✕ exit. Still open here: the
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
- [x] **`shopRecipe` silently no-ops** when a recipe has no non-heading ingredients
  — ✅ **Fixed 2026-07-02**: the recipe peek now passes `onShop: undefined` (which
  `buildRecipe` hides) when there are no buyable ingredients, so "Ajouter à la liste"
  isn't offered at all rather than dead-tapping — mirrors the `onMakeRoutine` gate.
- [x] **Empty-state dead-ends** — ✅ **DONE 2026-08-27** (bmad/12 #6). `EmptyState` gained an
  `action` slot: one quiet chip-link under the line, using the app’s own `?plus=` URL grammar so
  the door does what the ＋ FAB would have. Applied to the five genuine SECTION dead ends —
  the recipe book (the one this finding named), Les carnets, Business, Routines and
  « Mes habitudes » (whose copy already ended « …ou ajoutes-en une » with nothing to tap).
  **Deliberately NOT swept over all ~108 call sites:** a CELL empty (« Rien de prévu » on one
  day) is a complete answer, and padding it would be a nag — the copy contract in COMPONENTS.md
  says so. Guarded both ways by `e2e/empty-doors.spec.ts`, including the guest gate.
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
- [x] **Double edit surface for one routine.** ✅ **Fixed 2026-07-03**: the Réglages ✏️ now
  `navigate(\`/routine/${r.id}\`)` to the full-screen builder scene (`chores.tsx`), same as
  the Routines-tab picker — the inline `<li>` `RoutineForm` (the "worst sheet offender" under
  the mobile keyboard) is gone. `RoutineForm` stays alive (still the scene's form via
  `RoutineFormPage`); the unused import + `editing` state were dropped.
- [x] **No delete affordance in the Routines tab or edit scene** — ✅ **Fixed 2026-07-03**: the
  `/routine/:id` edit scene now shows a quiet ghost « Supprimer la routine » (RoutineForm
  `onDelete`, edit-mode only). `RoutineFormPage` owns it: a weighty `useConfirm` dialog →
  `useWrite` DELETE (offline-queueable) → invalidate `ROUTINES_KEY`/`BOARD_KEY` → back to the
  tab. Covered by `routine-builder.spec.ts` (deep-link → confirm → DELETE `{id}` → `/routines`).
- [x] **Nested interactive-in-interactive on the parent grid** — ✅ **fixed 2026-08-27**
  (verified in code 2026-08-28). The card is no longer a `role="button"`; the file now says so
  itself (`maison/RoutinesTab.tsx`, "The card is NOT a role=\"button\" any more"), and
  `src/lib/nested-interactive.test.ts` fails the build on the shape.
- [~] **e2e — the step editor itself is untested** — **stale (verified 2026-08-27):**
  `e2e/routine-builder.spec.ts` covers exactly what this asked for — removing the middle card
  keeps the deck aligned in the POST, reordering a card up is reflected in the POST order, and
  the edit scene's delete (confirm → DELETE → back to the tab). The parallel-array alignment
  story is additionally unit-tested in `src/lib/parallelArray.test.ts`. Nothing left.
- [x] **e2e — per-step countdown timer has zero coverage** — ✅ **DONE 2026-08-27**,
  `e2e/routine-timer.spec.ts` (6 cases). The persisted-shape distinction is what's pinned,
  because it's the whole reason the feature survives a sleeping tablet: **running** banks an
  absolute `{endsAt}` (recomputed from the clock on reopen), **paused** banks a duration
  `{left}` (no clock is running, so an absolute end would keep "counting" while paused). Plus:
  a card with no `seconds` renders no ring; a paused timer reopens at its banked remaining, not
  the full duration; a timer that expired while the app was away reads done, does NOT chime,
  and above all does NOT advance the story (NFR-CALM — the child still taps → themselves); and
  a read-only guest gets a working ring that never PATCHes. The fixture carried no card with
  `seconds`, which is why this went uncovered — the spec builds a variant off the exported
  `ROUTES` rather than hand-writing a payload that would drift.

### Findings — P3 (bigger / judgement)

- [~] ~~**Routines never surface on the Board, yet saving invalidates `BOARD_KEY`**~~ —
  **stale on BOTH halves (verified 2026-08-27).** Routines DO surface on the board now:
  `routineNext` is a real card (`lib/boardCards.ts:168`, `components/board/RoutineNextCard.tsx`),
  which is the "morning routine glance" this finding proposed as the alternative. And the
  save no longer touches `BOARD_KEY` at all — `RoutineForm` writes with
  `affectedKeys: [ROUTINES_KEY]`, which is the key the card actually reads. Zero
  `BOARD_KEY` references remain anywhere in the routine save path. Nothing to decide.
- [ ] **Two timers on screen at once** on a timed step — the `Countdown` ring
  (`RoutinePlayer.tsx:310`) *and* the run count-up stopwatch (`:351`) both show; potentially
  confusing on the toddler surface. Design decision on whether both belong.
- [x] **Parent overview shows no "done today"** — ✅ **stale (verified 2026-08-28).** The file
  moved to `maison/RoutinesTab.tsx`, which computes today's `doneCount` from `doneIdx` and
  shows it (clamped to the deck so the ring never over-fills, `:81`). The asymmetry is gone.
- [x] **`RoutinesSection` has no empty state** — ✅ **Fixed 2026-07-03**: renders
  `<EmptyState>{t.operator.noRoutines}</EmptyState>` when the list is empty, matching every
  sibling section (new `noRoutines` FR/EN key).
- [x] **Photo file input is `hidden`, not keyboard-reachable** — ✅ **Fixed 2026-07-03**: the
  `<label>`-wrapped `hidden` input (label not focusable, input out of tab order) is replaced by
  the ContactPhotos/NoteEditor pattern — one shared `aria-hidden`/`tabIndex=-1` input clicked by
  a real, focusable `<button>` (`pickBtn`). Palette emoji buttons now carry
  `aria-label={\`${t.operator.emojiPick} ${e}\`}` so each reads as a "choose ⟨icon⟩" action.
- [x] **ToD chip render block copy-pasted twice** within `RoutinesSection` — ✅ **Fixed
  2026-07-03**: the cue's inner label is computed once per row (`todText`/`todContent`) and
  rendered by both the inert guest badge and the operator's tap-to-cycle button.
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
- [x] **[nte] The full-screen `NoteEditor` is NOT bound to the visual viewport** — ✅ **stale
  (verified 2026-08-28).** `.note-editor` sits in the « Keyboard fit » list beside `.scene` and
  `.recipe-modal` (`core.css:740`), and `.note-editor__body` takes the trailing slack (`:754`).
  `src/styles/keyboard-fit.test.ts` now fails the build if that regresses.
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
- [x] **[nte] `NoteEditor` auto-save is entirely silent** — ✅ **fixed 2026-08-28.** Closing now
  says which of the three things happened: « Note enregistrée », « Note gardée — elle partira au
  retour du réseau » (queued), or « La note n'a pas pu être enregistrée ». That last one was the
  real defect under the reported one: each branch ended `.catch(() => {})`, so a genuine server
  rejection was swallowed too and a note could close and simply not exist. The toast bar is the
  only channel left at close — and reachable *because* the editor is unmounting; a notice raised
  from inside a full-screen scene is painted under it (`.undo-toast` is z-index 40). Emptying a
  note to nothing still deletes it and is deliberately NOT announced as saved.
- [ ] **[crn] Carnet-scoped Entretien rows are add-only from the carnet scene** (read-only
  text, `CercleCarnetPage.tsx:374`) while care-log and pins both get `RowActions` — to edit/
  delete a carnet's upkeep row the user must leave to Réglages ▸ Corvées. Wire `RowActions` →
  `HomeProjectForm` + delete.
- [x] **[frm] `ConnectPeople` comboboxes omit `typeaheadOnly`** — ✅ **Fixed 2026-07-02**:
  both person-A/B comboboxes now set `typeaheadOnly`, matching every other cercle combobox
  (no more free-text that resolves to nothing).
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
- [x] **[dir] Four hand-rolled Union-Find copies** — ✅ **already resolved** (verified against
  code 2026-07-02): the shared `UnionFind` class (`cercle.ts:625`) is used by ALL four sites —
  `detectFamilyGroups` (`:684`), `closedLinks`' sibling grouping (`:1474`), `CercleWeb` (`:64`),
  `CercleTree` (`:51`). No hand-rolled `parent`-map find/union remains; the finding was stale
  (the extraction shipped earlier, the box was never ticked). `relationsOf`/`relationTo` also
  moved to `lib/cercle.ts` (2026-07-02).
- [x] **[dir/crn] Cold non-401 fetch error reads as an empty circle/map, not an error**
  — ✅ **Fixed 2026-07-02**: added a shared `LoadError` fallback (`components/Fallback.tsx`,
  `role="alert"` + `t.common.loadFailed`) and both `Cercle.tsx` + `CercleWorldPage.tsx` now
  return it on `error && !data` (a stale-but-good poll still renders — kept over the error).
- [x] **[dir/crn] `role="img"` world SVG with interactive descendants** — ✅ **fixed
  2026-08-27** (verified 2026-08-28): the SVG is `role="group"` now (`CercleConstellation.tsx:152`),
  so its focusable islands/faces stay in the a11y tree, and `nested-interactive.test.ts` guards
  the shape. _(The `peopleN` calm gut-check was a question, not a defect — left as asked.)_
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
- [x] **🔒 No rate-limit + no revoke on stateless guest writes.** — ✅ **Fully closed 2026-07-02.**
  **Revoke:** migration `0098_guests` gives each minted link a row (keyed by its token id,
  written by `guest/start.ts`); `resolveActor` LEFT JOINs it and rejects a token whose
  `revoked_at` is set — killing the link's reads AND writes at once (a no-row legacy token
  still works until its TTL, never regressed). Operator-only `guest-links` endpoint (list/
  revoke) + « Liens actifs » UI. **Rate-limit:** migration `0099` adds `guests.use_count`;
  `chargeGuestUse` (`_lib/guestRate`) atomically bumps + caps it at **40** (429 over-cap),
  charged BEFORE any work in all four writable endpoints (`intake`/`postbox` submit + media),
  so one leaked link can't flood quarantine rows + R2 before it's noticed. Legacy tokens
  stay uncapped (expire within their short TTL). Distinct from the per-household `MAX_PENDING`.

### Findings — P2 (SECURITY + design)

- [~] **🔒 `showcase` over-shares, is the DEFAULT kind, long-lived, unrevocable.**
  ✅ **Mitigated 2026-07-02 via the finding's sanctioned "don't default + cap TTL + warn"
  branch:** the issuer no longer pre-selects showcase — it defaults to the least-privilege
  « babysitter » (`sitter`) kind, and showcase is moved LAST in the picker so it's a
  conscious choice; its warning gained a caution glyph; the 24 h default TTL + inline warning
  were already shipped. **Deliberately NOT narrowing the read-scope:** showcase renders the
  real read-only hub (that IS the Démo), so an allowlist would 403 whole tabs (Le cercle,
  photos) into `LoadError` — a curated Démo needs per-tab hiding for the showcase surface, a
  larger UX change tracked separately. Token **revoke** shipped (§509) — a leaked showcase link can now be killed before its TTL.
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
- [~] **e2e — zero coverage of any guest flow** — **stale (verified 2026-08-27):** four specs
  cover it now. `intake.spec.ts` (a relative fills and submits the form; the operator reviews a
  pending intake and accepts it into the cercle — the submit→review→accept round trip this
  asked for), `postbox.spec.ts` (text-only send with the sender name, a staged photo sent with
  the message, a returning sender's quiet reçu-✓, **and the revoked-link expired state**),
  plus `guest-scenes.spec.ts` and `guest-settings.spec.ts`. The remaining sliver is the unit
  half — `guestScope.test.ts` still doesn't exercise the showcase **denylist** branch
  (`home-pins`/`care-log`) — tracked with the other unit gaps, not as "zero coverage".

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
- [x] **Guest "done" state is client-only → duplicate pending rows** — ✅ **fixed 2026-08-27**
  (verified 2026-08-28): the submit carries an `idempotencyKey` (`IntakeForm.tsx:231`), deduped
  server-side in `authed()` via `_lib/idempotency.ts`.
- [~] **Nits:** ✅ WifiBlock's tap-to-copy password button now wraps + breaks a long key
  (`.handoff__wifi-pw`) so it never overflows the card at 320px (2026-07-03). Remaining:
  `INTAKE_KEY`/`POSTBOX_KEY` page-local literals (hygiene); the guest scenes hand-roll
  `scene__head` (deliberate — terminal scenes, no close); family/pin photos `alt=""`
  (decorative — SR users get nothing).

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
- [x] **Failed member add is silent** — ✅ **Fixed 2026-07-02**: `MembersSection.add` now
  sets an `err` state on catch and renders a `StatusMessage` (still keeps the typed name).
- [~] **Pairing nits:** ✅ `ClaimTablet` success banner now clears when a new code is typed
  (`devices.tsx`, 2026-07-02). Remaining: it writes via `api()` not `useWrite()` with no
  `useOnline()` gate/justifying comment (`:34`) — though pairing is inherently online (it
  needs the server round-trip immediately), so this is arguably correct-as-is.
- [ ] **Phone settings nav** is a wrapping chip row **plus** a second wrapping `OperatorJump` row,
  with no active-tab-scroll-into-view on deep-link (`Operator.tsx:307`) — can push content far down
  at 320px. Verify against the overflow guard.
- [ ] **e2e gaps:** stale section ids in `settings-sections.spec.ts:10` (retired ids alias to hosts
  → duplicate screenshots under different filenames); **no** device-revoke / member-delete-rename
  round-trip; untested config sub-panels (schedule, cars, todo-templates, home-projects
  Projets/Entretien, the chore ledger); `ThisWeek` render never **asserts** faces-not-counts; photo
  upload+delete+undo only smoke-rendered.

### Findings — P3 (bigger / judgement)

- [x] **Réglages writes via `api()` not `useWrite()`** — ✅ **DONE 2026-08-27**, decided per call
  site rather than in bulk. **Migrated** (real household writes, worth queueing): the photo delete
  (`media.tsx` — its `undoableRemove` commit now goes through `useWrite` with `PHOTOS_KEY`, so a
  delete confirmed on a tablet that just lost its uplink replays instead of throwing behind an
  already-removed tile) and the AI toggle (`lib/ai.ts` `useAiToggle` → `useWrite('household', …)`
  with `HEALTH_KEY`+`HOUSEHOLD_KEY`). **Annotated as deliberate exceptions + gated on `useOnline()`**:
  the ai-errors DELETE (emptying a diagnostic journal — a queued clear would wipe failures logged
  *after* it, on reconnect; the button now disables offline) and the `ai-test` POST (a probe, not
  a write). Both carry the why in a comment beside the call.
- [ ] **Latent flash-back edge:** `DayPlanPage` reads `EVENTS_KEY`/`CHORES_KEY` **live**; a
  RealtimeHub `invalidate` on another device mid-undo-window could resurrect a row deleted in
  Réglages (the shell's own queries aren't live, so it's safe there). The row snapshot mitigates
  but doesn't prevent.
- [~] **First-paint flashes:** ✅ Photos guarded on `isPending` 2026-07-02 (Phase 0, `media.tsx:112`)
  so "noPhotos" no longer flashes before the grid. _Still open:_ `ThisWeek` has no error state (a
  failed fetch reads as an empty week, `:94`).
- [x] **`AiStatusTest` ("Tester l'IA") shows even when the household turned AI off** — ✅ **DONE
  2026-08-27.** It still shows (probing the wiring while the switch is off is exactly when you'd
  want it), but when `available && !enabled` it now says so: « L'IA est éteinte pour la maisonnée
  … ce test vérifie le branchement, pas l'interrupteur » — so a green pass can't read as "AI is on".
- [~] **Reuse candidates** — half resolved 2026-08-28, half re-scoped:
  - ~~`OperatorJump` not registered in DevKit~~ — **stale**: the component no longer exists
    anywhere in `src/`. Nothing to register. (Caught only by grepping the tree rather than
    DevKit alone — checking the gallery for an absence proves nothing about the codebase.)
  - ~~`ItemReorder` hand-copies EditField's reorder buttons~~ — ✅ **fixed 2026-08-28**: both
    render the shared `<Reorder>` (`components/Reorder.tsx`), in DevKit and `COMPONENTS.md`.
    They were identical down to the class names, and the private copy even passed by hand the
    two i18n strings the other hardcoded.
  - **Still open:** `ChoreForm`/`BlockForm` hand-roll the same member-toggle row (candidate
    shared `MemberToggleRow`); `DeviceRow` hand-rolls optimistic rename vs `HouseholdListSection`.
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
- [x] ~~**`createBringList` failure is fully silent**~~ — **already resolved when re-verified
  (2026-08-27):** the catch sets `bringErr` → `<StatusMessage tone="error">` (`EventForm.tsx:185,510`),
  the `api()` exception is commented as online-only-because-it-needs-`res.id`-synchronously, and
  « Créer la liste » is `disabled={bringBusy || !online}` with a `t.offline.unavailable` notice.
  A stale finding — the fix landed with the date/time-label batch and the box was never ticked.
- [x] **EventForm date/time inputs are mislabelled.** The `<input type="date">` has **no**
  aria-label/visible label (`EventForm.tsx:224`); the time input's aria-label is `eventAllDay`
  ("Toute la journée") — wrong for a time field (`:230`). Contrast ChoreForm/HomeProjectForm,
  which wrap dates in a labelled `.recur__row`. Give the date a label + relabel the time.
- [x] **e2e — the AI-off degrade path is now covered** (`e2e/capture-degraded.spec.ts`, 2026-07-03):
  the **AI-off → degraded → manual 7-type picker** and the **reroute-MOVEs-not-dupes** paths (the
  capture-never-lost guarantee) both have specs. _Still open:_ the event-form e2e (`screenshots.spec.ts:150`) asserts « Trajet »/« À apporter »
  render + types one bring item, but **never clicks « Créer la liste », never verifies auto-
  select, never submits** — so draft-discard/auto-select stay untested and `AUJOURDHUI.md:131`'s
  `[ ] Unified event form` is only half-closed (reconcile it). Also no create round-trip for
  ChoreForm/HomeProjectForm, no Trajet persist-on-edit.

### Findings — P3 (bigger / judgement)

- [~] **Query-key + invalidation gaps in capture** — two of three **stale (verified 2026-08-28)**:
  ~~`submitList` invalidates `['ghosts']`/`['list-history']` as inline literals~~ (neither
  literal is in `AddSheet.tsx` any more) and ~~`MONTH_KEY` is not in `CAPTURE_KEYS`~~ (it is —
  `lib/captureKeys.ts:23`). **Still open:** event/task/meal titles are **unclamped** (only the `note` path
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

- [x] **Global Search reaches every entity.** ✅ **closed 2026-07-02.** `SearchPage` was already
  extended with carnets + home-projects; this pass adds the last three — `care_log`, `home_pins`
  and `drawings` (see §808 above). People/pets/businesses/carnets/home-projects/care-log/home-pins/
  drawings all ingested now.
- [x] **Search cold-load false "aucun résultat"** — ✅ **Already fixed** (verified 2026-07-02):
  `SearchPage.tsx:265` computes `fetching = useIsFetching()` and shows `t.search.searching` until the
  queries settle (`:341-348`), only then `noResults`. This box was stale; kept for the record.
- [ ] **Undated trips + dead cover-photo.** `VoyageCard`/`MonthView` only list trips with
  start+end (`VoyageCard.tsx:18`), and there's no trip-list surface, so an undated trip is
  unreachable after you close the scene. And `Trip.media_key` is read (`VoyageDocuments.tsx:80`) +
  PATCH-accepted but `VoyageForm` has no cover picker → write-only dead branch. Require dates (or
  surface undated trips) + wire or drop the cover.
- [~] **e2e gaps:** ~~**Voyage has ZERO coverage**~~ — **stale (verified 2026-08-27):** the
  mocks landed and `e2e/voyage.spec.ts` now runs 10 cases (create → navigate, the four sub-tabs,
  packing add + check, itinerary drag-reorder PATCHing `position`, a PDF attach that uploads then
  posts a document note, an info note behind its category pick, trip edit PATCH, and the
  confirm-gated trip delete), with `e2e/voyage-share.spec.ts` adding 8 more for the shared-trip
  half. **Search has no functional test**
  (only the Ask button's visibility) — nothing asserts a query surfaces rows across sections.
  Departure's one write (ActivityBring "Ajouter à cocher") is untested; Jouer is screenshot-only.
  ✅ **Search now has a functional test** (`e2e/search.spec.ts`, 2026-07-02): asserts a query
  surfaces rows across sections (events + the new drawings section), the care-log/home-pins sections
  surface + link to the carnet, and the business/family-note hits deep-link to the item.

### Findings — P3 (bigger / judgement)

- [~] **Shared-primitive nits** — the first is **stale (verified 2026-08-28)**: ~~`capitalize`
  re-defined ×3~~ — there is exactly ONE definition left (`lib/format.ts:8`), and `MomentsView`
  no longer exists at all (« Moments » was retired). **Still open:** Departure hand-rolls
  empty/loading (`departure__empty`/`loading mono`) instead of `EmptyState`; gallery `['drawings']`
  key is local (`drawingGallery.ts:23`) not in `queryKeys.ts`; `DrawingGalleryPage` members query
  lacks `...live` (`:40`) unlike every other consumer.
- [x] **a11y nits:** ✅ **both fixed 2026-07-02.** Search results show a `role="status"` count
  line (« 3 résultats ») so a SR user hears the total; and `.moment-chip` now has an explicit
  44px min-height (inline-flex centred) so the four window chips keep a real tap target even
  when the height-matched hero card squeezes the row.
- [~] **UX nits:** ✅ business/family-note Search hits now deep-link to the ITEM — the hit carries
  `?item=<id>`; `Cercle` hands it to `BusinessesTab` (opens the peek + scrolls + a one-time pulse)
  / `CercleNotes` (switches to the note's scope face, expands it in place, scrolls + pulse), then
  clears the one-shot focus. Covered by `e2e/search.spec.ts`. _Remaining:_ Voyage twin `type="date"`
  inputs + packing move-`<select>` unverified at 320px; trip "Bagages" doesn't reuse the shared
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
- [x] **Waking the screensaver by tap does NOT reset the shell idle cycle** — ✅ **DONE 2026-08-27.**
  New `lib/idleHold.ts`: HubLayout registers its `reset` there, `AmbientScreen`'s `onWake` pokes it.
  The `stopPropagation()` stays (the wake gesture must not land on a board control underneath) —
  the poke is the channel a stopped event can still reach. Also fixed while there: the dialog now
  takes focus on show and hands it back on wake, so its own `onKeyDown` stops being dead code and
  a keyboard user's focus ring isn't stranded behind the z-200 overlay.
- [x] **Day-part auto-advance loop isn't restarted when enabled mid-session** — ✅ **DONE 2026-08-27.**
  `startDaypartDrift()` now arms its 10-min interval unconditionally and `tick` re-reads the flag
  (an off session costs one no-op per tick), so flipping the toggle on mid-session both paints now
  AND keeps advancing. The toggle's inline paint is deduped into the shared `applyDaypartNow()`.
- [x] **Screensaver is default-ON and arms on mobile, but the help copy says "kiosk only"** —
  ✅ **DONE 2026-08-27.** Copy fixed (« sur CET appareil — tablette murale comme téléphone »)
  and, since `ambientNote` was never rendered anywhere, it is now shown under the screensaver
  toggle in Réglages ▸ Mode veille. Kept armed on every surface deliberately: a wall tablet
  signed in as the operator reads as `surface==='mobile'`, so scoping the default off by surface
  would disable the screensaver on exactly the device it exists for.
- [x] **`RealtimeHub` doesn't use the WebSocket Hibernation API** — ✅ **DONE 2026-08-27.**
  `server.accept()` + the in-memory `Set<WebSocket>` → `state.acceptWebSocket(server)` +
  `state.getWebSockets()`, so the runtime holds the sockets and the object can be evicted while a
  wall tablet's connection stays open — instead of billing continuous wall-clock per household for
  a hub that is idle between writes. The `addEventListener('close'|'error')` pair became the
  `webSocketClose`/`webSocketError` hibernation callbacks (the listeners would never fire again
  after an eviction). No `webSocketMessage` handler: clients only listen (`src/lib/realtime.ts`),
  so nothing wakes the object except a broadcast. Both socket kinds ride the same class (a
  household room and a `st:<id>` shared-trip room are two DO **ids**), so one change covers both.
  No wrangler migration needed — hibernation is an API, not a class change.

### Findings — P3 (bigger / judgement)

- [x] **Outbox head-of-line blocking** — ✅ **DONE 2026-08-27.** `OutboxEntry.attempts` + a pure,
  unit-tested `replayVerdict(err, priorAttempts)` (`auth-lost` / `drop` / `dead-letter` / `retry` /
  `wait`). Only a **5xx** — a real server answer — spends an attempt; a transport failure returns
  `wait` and costs nothing, so being offline five times can't dead-letter a good write. Past
  `MAX_ATTEMPTS` (5, each needing its own replay trigger) the entry is dropped and counted into the
  existing one-line "some offline changes couldn't be saved" toast, and the rest of the queue lands
  on that same run. FIFO order is kept for everything else (the E-41 tmp-id chain depends on it).
- [x] **Pending-write count is invisible when `navigator.onLine` lies "online"** — ✅ **DONE
  2026-08-27.** `OfflineBanner` now returns null only when `online && !stale && pending === 0`;
  a third "pendingOnly" face shows « Changements en attente d'envoi · N » with the
  counter-clockwise clock glyph.
- [x] **Voice input doesn't hold off idle** — ✅ **DONE 2026-08-27.** `useVoiceInput` pokes
  `lib/idleHold` on start and every 15 s while `listening`, so a hands-free capture holds off both
  the screensaver and the return-home drift. One place, so every voice surface inherits it.
- [~] **Ambient reuse nits** — the two real ones are done; the third is a deliberate ➖.
  ✅ the screensaver dialog now takes focus on show and restores the opener on wake (see the P2
  entry above), so `onKeyDown` is live and no focus ring is stranded. ✅ the hand-rolled on/off
  toggles are gone — `operator/ambient.tsx` and `operator/display.tsx` both use the shared
  `<Toggle>`. ➖ `AmbientScreen` keeps `useAmbientScene`'s ticker rather than the shared `useNow`
  **on purpose**: that ticker is gated on `active` and re-seeds on wake, so an idle screensaver
  never joins the app-wide minute tick (free-tier/battery) and never flashes a stale clock.
- [x] **e2e — behavioural coverage of the whole layer** — ✅ **DONE 2026-07-03**: the offline
  **outbox** queue→replay (`offline-outbox.spec`), the **SW** precache + offline reboot (`sw.spec`
  + `sw.config`, on a `vite build`/`preview` harness since the SW is a PROD-only build artifact),
  the **WS fan-out** invalidate→refetch (`realtime.spec`, mocking the DO via `page.routeWebSocket`),
  and **idle** wake (`idle-ambient.spec`, driving `idleDebug`) all now have specs. _Only remaining
  unit-only bits: the day-part drift and the idle warn-chip/drift edges — low-value to drive._

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
| Guest path allowlist honoured by every read-only projection | Share-links → Cast/Family/Handoff/Welcome | [x] projections honour it + can't write; `/api/live` guest-gating ✅ closed (fdc1211); **remaining caveat:** `showcase` over-shares (§4 P2) |
| Capture modes land in the correct section + lossless AI-degrade | ＋ Add → Board/Kitchen/Routines/cercle | [x] AI-degrade airtight (row always inserted, reroute=MOVE); every intent lands. **But offline/5xx capture is silently lost** (skips outbox + swallows errors, §6 P2) |
| Global Search reaches every entity type | Search → all | [x] ✅ 2026-07-02 — reaches people/pets/businesses/recipes/notes/list/events/routines/todos/pantry/cars/carnets/home-projects/**care-log/home-pins/drawings**; business + family-note hits deep-link to the item (not the list). `e2e/search.spec.ts` covers it |
| Read-aloud/voice config consistent | Settings ▸ Voix → Routines/Liste/Kitchen toddler | [x] verified — `VoiceSection` (per-lang voice + rate) drives the shared `useSpeak`; recorded clip overrides TTS per card; recipe has a per-recipe `lang`, routines read in global lang (asymmetry noted, acceptable) |
