# UNIFORMIZING.md — app-wide reuse / generalization backlog

> A standing audit of where Babillard **fails to reuse** an existing primitive, helper,
> class family, convention, or schema shape — and the concrete refactor that folds the
> divergence back onto the canonical thing. Produced 2026-06-26 by a parallel sweep of
> six layers (frontend components · CSS · lib/conventions · backend handlers · D1 schema ·
> i18n + page structure).
>
> **How to use this:** work it **top-down, one item at a time**, with visual QA — not a
> blind find/replace. Each item has a checkbox, the concrete sites, and the recommended
> canonical target. Tick items as they ship. This pairs with `COMPONENTS.md` (the
> primitive inventory) and `/dev/kit` (the live gallery).
>
> **Reading the severity tags:** 🔴 High = real duplication/divergence worth fixing ·
> 🟡 Medium = inconsistency, fix opportunistically · 🟢 Low = nit / convention-only.
> **CONVENTION-ONLY** items are *forward rules* — adopt for new code, do **not**
> retroactively churn a mature, working surface (especially forward-only DB migrations).

---

## ⭐ Start here — highest value, lowest risk

These are the items with the best ratio of consistency-gain to regression-risk. Do them first.

1. **[🔴 FE-1] Migrate hand-rolled `.subtabs` to `<SubTabs>`** (5 sites) — see [FE-1](#fe-1).
2. **[🔴 FE-2] Migrate the three recipe overlays onto `<Modal>`** — see [FE-2](#fe-2).
3. **[🔴 LIB-2] Pull inline query keys into `lib/queryKeys.ts`** (esp. `['members']` ×11, `['board']` inline) — see [LIB-2](#lib-2).
4. **[🟡 BE-2] Extract the duplicated `keyish` R2-key validator into `_lib/validate.ts`** — see [BE-2](#be-2).
5. **[🟡 CSS-1] Replace hardcoded `999px` radius and `#fff`/`#000` with tokens** — mechanical, theme-correctness win — see [CSS-1](#css-1).
6. **[🟡 I18N-1] Consolidate duplicated button labels into `common.*`** — see [I18N-1](#i18n-1).
7. **Write a "Schema Conventions" block** (CLAUDE.md or a doc) capturing the DB naming rules below, so new migrations stop adding drift — see [DB conventions](#db-conventions-forward-rules).

---

## 1. Frontend components

### <a id="fe-1"></a>FE-1 🔴 Hand-rolled segmented tabs instead of `<SubTabs>`
Five components re-implement the `role="tablist"` + `.subtabs` button structure instead of
the shared `SubTabs` (COMPONENTS.md already flags deal/flyer/recipe-book as migratable).

- [x] `components/DealsBrowser.tsx` (~L150, `.subtabs deal-tabs`) → `<SubTabs className="deal-tabs">` ✅
- [x] `components/FlyerViewer.tsx` (~L419, `.subtabs flyer-tabs`) → `<SubTabs className="flyer-tabs">` ✅
- [ ] `components/kitchen/RecipesTab.tsx` (~L328, `.subtabs subtabs--mini`) → `<SubTabs size="mini">` — needs help-key
  mapping (single `'collections'` key) + the sibling book button; do with a CSS check (own commit).
- [ ] `components/cercle/FamilyBuilder.tsx` (~L410, `.cercle-viewswitch`) → `<SubTabs>` if the API fits — **kept distinct
  for now**: `.cercle-viewswitch__btn`/`.is-active` is a deliberately different (boxed, not pill) style; adopting SubTabs
  restyles it. Revisit if we want it to match the pill family.
- [ ] `components/CookMode.tsx` (~L514 `.cook__siblings`, ~L602 `.cook__split-tabs`) — **review first**: these
  carry cook-specific semantics (multi-recipe siblings, split-view). Either add a SubTabs variant or
  consciously keep them distinct and note why.

### <a id="fe-2"></a>FE-2 🔴 Recipe overlays hand-roll their scrim/card instead of `<Modal>`
All three already use `useModal` (behaviour is unified), but duplicate the **scrim+card markup**
and own a parallel CSS family. Fold the outer chrome onto `<Modal>`, keep the inner layout CSS
(mirrors how `EmptyFridgeSheet` does `<Modal className="fridge-modal">`).

> ⚠️ **RE-SCOPED 2026-06-26 after review — the FE-2 premise was stale.** `.recipe-modal` is no longer a
> centered modal: `recipes.css` L67-90 makes it a **full-screen scene route** (`position:fixed; top:0;
> height:100dvh`, `.kb-open` keyboard-pinning via `--vvt/--vvh`, "No backdrop — the card IS the screen").
> Folding it onto `<Modal>` (a 460px centered `.kit-modal` dialog) would *reverse* a deliberate design and
> break keyboard pinning. Verdict below.

- [~] `components/RecipeForm.tsx` `.recipe-modal` → **N/A — it's a full-screen scene, not a modal.** The real
  uniformization here is a shared *scene* wrapper (ties to [STRUCT-1](#struct-1) `EditScene`), NOT `<Modal>`.
- [~] `components/RecipeSheet.tsx` `.recipe-modal` → **N/A — same (full-screen scene).**
- [ ] `components/RecipeReadReview.tsx` (~L147, `.read-review` + manual `createPortal`) → `<Modal className="read-review">`
  — **the one genuine centered overlay.** Deferred: needs `recipes.css` `.read-review__*` rewritten to nest under
  `.kit-modal` (drop the outer `position:fixed`/scrim/`56rem`-card rules, move `__bar`/`__body`/`__foot` inside the
  kit-modal card, restore width via the `.read-review` override, pass Modal `title`, delete local portal/`useModal`).
  Modest value, real visual risk — own commit with visual QA.
- [~] `RecipeFormPage.tsx` hand-rolled `<h2>` → **no change**: the page is a thin route wrapper with no `<h2>` of its
  own; the STRUCT-1 `<h2>` lives inside RecipeForm's `.recipe-modal__bar` (a scene), so it rides the scene-wrapper work.

### FE-3 🟡 `KidExitGate` bespoke modal
- [ ] `components/KidExitGate.tsx` (~L113–161, `.kid-exit-overlay`/`.kid-exit-modal`) — security-gate styling is
  intentionally distinct, but the scrim/focus/Esc behaviour duplicates `useModal`. Wrap in `<Modal>` keeping
  the custom CSS, OR leave as-is and document the exception. Low priority, security-sensitive.

### FE-4 🟢 Already-correct (no action — recorded so we don't re-audit)
- ✅ **Icon discipline is clean** — control affordances all use the Phosphor `<Icon>` set (`pencil-simple-bold`,
  `trash-bold`, `plus-bold`, …); content emoji are content. No emoji-as-control offenders found.
- ✅ `CookMode`/`CashierMode` full-screen surfaces are correctly NOT modals (only their tab strips, FE-1).
- ✅ Empty/status/header/list-row/chip/picker-menu sweeps are **done** per COMPONENTS.md backlog rows 1–8.

---

## 2. CSS / styling system
*(25 css files, ~19.5k lines; `styles.css` `@import` order IS the cascade — append-only.)*

### <a id="css-1"></a>CSS-1 🟡 Hardcoded values that should be tokens
- [x] **`border-radius: 999px`** — ~64 instances → `var(--radius-pill)`. Mechanical, safe. ✅ (64 replaced, 16 files)
- [~] **`#fff` / `#000`** — **REVIEWED 2026-06-26 → mostly a false positive; no churn.** Of ~61 occurrences:
  (a) `handoff.css:209-243` is inside `@media print` — white-on-black is *correct for paper*, not a night bug
  (the audit's flagged "correctness bug" was wrong). (b) 34 are intentional **white-on-colour** (avatars, sage/
  accent badges, scrim-overlaid photo labels) — correct in both themes, leave. (c) the "SURFACE-BG" image/drawing/
  QR containers (`.qrcode__img` must be white to scan; `.drawpad__canvas`/`.note-card__draw` hold dark ink strokes
  that vanish on a dark surface; flyer/logo containers assume a light backing) **must stay light** — flipping them
  to `var(--card)` (dark in night) is a REGRESSION. (d) the rest already use `var(--token, #fff)` fallbacks. The only
  nit, `today.css:203` using `--card`'s hex `#fffcf5` as a text colour, was left (a theme-flip would harm contrast).
  **No `--surface-inverse`/`--ink-inverse` needed.** Net: keep the radius/touch-target wins (done); skip the colours.
- [x] **`min-height: 44px`** (touch target, ~7×) → add `--touch-target: 44px`. ✅ (token added; 9 min-h/min-w replaced)
- [ ] Repeated `rgba(0,0,0,0.04/0.08/0.3)` hairline/overlay literals (~20×) → `--overlay-faint/-light/-dark`
  (+ warm-ink `rgba(44,39,34,…)` variants).

### CSS-2 🟡 Duplicate / fragmented class definitions
Same class defined twice (cascade-order-dependent, fragile):
- [ ] In-file dupes: `.auto-card` (pages.css ×2), `.now-card--moment` (today.css ×2), `.recipe-meta-row`
  (recipes.css ×2), `.sky-tonight--kid` (photos.css ×2), `.tdl-finish` (kid.css ×2) — merge.
- [ ] Cross-file dupes (relying on import order to win): `.avatar` (photos+today), `.bigtile` (almanac+pages),
  `.hub` (hub+pages), `.kid` (kid+pages), `.today-hero` (almanac+pages). Pick one canonical home; delete the
  shadow; add a comment noting the canonical location.

### CSS-3 🟡 `pages.css` is a 3.7k-line kitchen sink (423 classes, 19% of all CSS)
- [ ] Extract shared layout/component patterns out of `pages.css` (and split `sheets.css` 2.4k / `board.css` 1.9k)
  into purpose files placed correctly in the cascade. Large, do carefully with visual QA. **Medium-term.**

### CSS-4 🟡 Ad-hoc button-like elements bypassing the `.btn` family
- [ ] `.board-focus__all`, `.disclosure__summary`, `.kitchen__note-add`, `.kitchen__slot`, `.routine-card__run`
  each hand-roll padding/radius. Extend `.btn` with `--text` (link-style) and `--dashed` (editable-slot) variants,
  then adopt. Improves tap-target consistency.

### CSS-5 🟢 Convention-only
- [ ] BEM drift (`__`/`-`/camelCase mixed) — standardize on `.block__el--mod` for *new* CSS; document in core.css.
- [ ] `var(--x, <fallback>)` with wrong/undefined fallbacks (`--surface-2`, `--hairline` referenced but undefined;
  `var(--accent, #2a8f85)` fallback is the *deep* colour). Either define the token or drop the fallback.
- [ ] Add a `--text-xs…--text-lg` size scale; replace scattered `0.78/0.82/0.85/0.9rem`.

---

## 3. lib/ helpers & cross-cutting conventions

### LIB-1 🟡 Writes via `api()` instead of `useWrite()` (offline-outbox bypass)
The sweep found ~50 direct `api()` write calls. **Triage required — several are legitimately exempt:**

- **Genuinely exempt (leave, but add a one-line comment noting why):** auth flows (`Login.tsx`,
  `auth.tsx` logout) and anything that runs before/around the session can't go through the household outbox;
  fire-and-forget telemetry (`aiErrorToast.tsx` posting an AI-error journal) shouldn't be queued/retried offline.
- [ ] **Should migrate to `useWrite()`** (user-meaningful writes that deserve offline queueing + invalidation):
  - `components/operator/IntakeReview.tsx` (~9 calls: upsert/merge/dismiss)
  - `lib/ghost.ts` `patchGhost`/`deleteGhost` (called from QuickAddPage, operator/shopping)
  - `lib/drawingGallery.ts` `patchDrawing`/`deleteDrawing`
  - `lib/loves.ts` (recipe ❤ toggle), `lib/measurePrefs.ts` (household PATCH), `lib/ai.ts` (AI toggle PATCH)
  - `components/AddSheet.tsx` (3), `pages/SharePage.tsx` (2), `pages/PriceMatchPage.tsx` (2),
    `components/cercle/ContactPhotos.tsx` (photo POSTs — see also LIB-4)
  - **Decide per call**: settings PATCHes (ai/measure) are debatable — they're tiny and online-only-ish.
    Document the rule "user content → useWrite; device/household toggles → api() OK" once decided.

### <a id="lib-2"></a>LIB-2 🔴 Inline query keys (cache-drift risk)
Keys spelled as inline arrays in many files; should be the canonical constants in `lib/queryKeys.ts`.

- [x] `['members']` — **11 sites** (AddSheet, AutoCard, DrawPad, FormScene, HeartButton, ProfilePicker, Operator,
  VoiturePage, DrawingGalleryPage, idleDebug, schedule) → `MEMBERS_KEY`
- [x] `['photos']` ×7 → `PHOTOS_KEY`; `['events']` ×5 → `EVENTS_KEY`; `['chores']` ×5 → `CHORES_KEY`;
  `['weather']` ×3 → `WEATHER_KEY`; `['devices']` ×2; `['flyers']` ×2; `['ai-errors']` ×2
- [x] **`['board']` used inline** where `BOARD_KEY` exists (DayPlanPage, Kitchen, useRecipeShop, DealsBrowser) —
  mixing constant + literal in the same app is the exact drift the convention forbids.
- [x] Centralize the parameterized guest-window keys: `['guest-window', preview ?? 'self', …]` (WelcomePage,
  HandoffPage, FamilyWindowPage, IntakeForm, Postbox) into a `guestWindowKey(preview, sub?)` helper.

> ✅ **LIB-2 DONE 2026-06-26** (commit 889753e) — 8 new key constants + `guestWindowKey()` in `lib/queryKeys.ts`,
> ~42 src files de-inlined.

### LIB-3 🟢 Duplicate small utilities (verify then consolidate)
- [ ] Sweep `lib/` for near-duplicate <50-LOC utils: member display-name resolvers, local-day/date helpers,
  R2/img-url builders, slot-label functions. (Prior audits consolidated several — confirm none regressed.)

### LIB-4 🟡 Media upload not always via `uploadMedia()`/`useMediaUpload()`
- [ ] `lib/drawingGallery.ts`, `components/cercle/ContactPhotos.tsx`, `components/operator/media.tsx`,
  `operator/household.tsx` (~L262 avatar blob POST) call `api()` with a Blob directly. Route through the shared
  helper so resize/`{key}`/503-`MediaUnavailableError` handling is uniform.

### LIB-5 🟢 Already-correct
- ✅ **No HTML5 `draggable`** offenders — all DnD goes through `usePointerDnd`.
- ✅ **localStorage stores** use the `useSyncExternalStore` shape (`ambient.ts`/`boardCards.ts`); no parallel pattern.
- ✅ Width-based branching reviewed — `CastPage` `innerWidth` is a legit fit-to-screen measurement, not a
  surface/audience decision. (Spot-check the rest if touched.)

---

## 4. Backend handlers (Worker / `functions/`)
*Overall the backend is the most uniform layer — 80+ endpoints all use `authed()` + `json.ts` helpers;
routes.ts ↔ handlers fully matched; R2/realtime/idempotency consistent. Findings are small.*

### BE-1 🔴 DELETE statements missing defensive `household_id` scope
Safe today (ids come from scoped SELECTs) but lacks defense-in-depth; one refactor away from a leak.
- [x] `functions/api/photos.ts:44`, `postbox.ts:72`, `intake.ts:62` (the loop-cleanup deletes) →
  add `AND household_id = ?`. The main deletes in those files already scope correctly. ✅ (889753e)

### <a id="be-2"></a>BE-2 🟡 Duplicated `keyish` R2-key validator
- [x] Identical `/^[A-Za-z0-9_-]{1,64}$/` validator redefined in `drawings.ts:27`, `family-notes.ts:33`,
  `notes.ts:33`, `guest/postbox-submit.ts`. Extract `isValidR2Key()` into `_lib/validate.ts` (beside `hexColor()`)
  and import everywhere media keys are accepted. ✅ (889753e — also found+folded `routines.ts`, `recipes.ts`)

### BE-3 🟢 Minor consistency
- [ ] Redundant `if (ctx.env.PHOTOS)` guards before `deleteR2Blob()` in `care-log.ts:208` / `home-pins.ts:131`
  (the helper already no-ops on an unset bucket) — drop them to match the rest.
- [ ] Auth handlers (`login`/`signup`/`logout`) hand-build success `Response`s to set `Set-Cookie`. Acceptable —
  either add a `json.ts` helper that accepts extra headers, or just add a comment documenting the carve-out.
- [ ] Standardize the R2-unset message string (`'Stockage photo indisponible ici.'` vs `'…image…'`) or keep
  intentionally differentiated.

---

## 5. D1 database schema
*~85 forward-only migrations. The schema is cohesive; most findings are **naming drift** and **shape
divergence**. ⚠️ Because migrations are forward-only & filename-locked, prefer documenting conventions and
backfilling additively over risky column renames on hot tables.*

> **Re-scoped 2026-06-26 — only 1 real household exists today.** Data-migration risk is ~0 and this is the
> **cheapest window we'll ever have** to actually fix the renames below (DB-1 media cols, DB-2 `colour`, DB-3
> `position`, DB-4 recurrence). The "→CONVENTION / leave unless rewriting" hedges were about *live-data* risk —
> that's gone. Treat DB-2/3/4 and the DB-1 column rename as **do-now** rather than forward-only. See
> [Part II §D.1](#d1--now-worth-doing--the-migration-window-is-the-whole-reason-they-were-deferred). It's still
> real code churn (every reader), just no data danger.

### DB conventions (forward rules) — write these down first
Adopt a **"Schema Conventions"** section (CLAUDE.md or `bmad/`) so new migrations stop adding drift:

> ✅ **DONE 2026-06-26** — written into `PlannerOrSomething/CLAUDE.md` ▸ "Schema
> conventions (every new migration follows these)". The boxes below are captured there.

- [x] **Timestamps:** `created_at` (all), `updated_at` (all mutable), `deleted_at` (soft delete). Avoid new
  bespoke names (`archived_at`, `dismissed_at`) unless the semantic is genuinely different — and then comment it.
- [x] **Colour:** one spelling. The app already leans **`colour`** (members/businesses/pets/groups); new columns
  use `colour`. (`tasks.color`, `home_projects.color`, `schedule_blocks.color`, `carnets.color` are the existing
  `color` outliers — see DB-2.)
- [x] **Ordering:** `position` (not `sort_order` / `sort`).
- [x] **Media:** `media_kind` + `media_key` (+ `scene_key` for editable drawings). Single column over parallel arrays.
- [x] **Attribution:** soft `TEXT` member ref, nullable, no FK (so deleting a member never cascades old content);
  use a junction table (like `task_participants`) when you need role/timestamp/multi-author.
- [x] **Discriminators:** `kind` for entity sub-type, `status` for workflow state, `type` only for relationship edges.
- [x] **JSON defaults:** arrays default `'[]'`, objects `'{}'`, `NOT NULL` — never bare `NULL`.
- [x] **Soft refs:** comment each `*_by`/`*_id`-without-FK explaining the soft-ref intent.

### DB-1 🔴→CONVENTION Media attachment has 3 competing schemas
Single-column (`r2_key`/`photo_key`/`media_key`) vs parallel arrays (`recipes.steps_images_json`,
`routines.cards_*_json`) vs `media_kind`+`media_key`(+`scene_key`). The **`media_kind`+`media_key`+`scene_key`**
trio (notes/family_notes/postbox/drawings) is the most expressive — make it the standard.
- [x] **Forward rule:** new blob attachments use the trio + name the column `media_key`.
- [x] ✅ **Single-column stragglers renamed (mig 0088).** `photos.r2_key`, `contacts.photo_key`,
  `contact_photos.photo_key`, `businesses.photo_key`, `pets.photo_key`, `intake_media.r2_key`,
  `postbox_media.r2_key` → `media_key`. All backend-only (the API already maps these to camelCase; no src/ reader),
  SELECTs alias `media_key AS <old>` so row interfaces stay identical. **Deliberately NOT renamed:** `recipes.image`
  (holds a key OR a full `https://` URL — `media_key` would mislead). typecheck + 797 tests + build green.
- [ ] **Opportunistic:** when next touching recipe-step-images / routine-card-audio, consider normalizing the
  parallel arrays into a `(parent_id, position, media_key)` junction table. **Do not** mass-migrate working data
  just for tidiness — high risk, low user value. *(Still deferred — out of Phase 2 scope.)*

### DB-2 🟡→CONVENTION `color` vs `colour` (10+ tables)
- [x] ✅ **DONE (mig 0087).** New columns use `colour`. Renamed every `color` outlier — scalar columns
  `tasks.color`, `home_projects.color`, `schedule_blocks.color`, `carnets.color` + the household JSON-pref columns
  `meal_slot_colors`/`recipe_tag_colors_json`/`measure_colors` → `colour(s)`. All backend SQL readers updated;
  SELECTs alias `colour AS color` (and the JSON columns back to their old names) so every TS row interface + API
  JSON key stays byte-identical — zero frontend churn. (Out of scope, left: the `color?` keys *inside* the
  reserve_locations / cars JSON arrays, and the `avatar_kind='color'` discriminator value — neither is a column.)
  typecheck + 797 tests + build green.

### DB-3 🟡→CONVENTION `position` vs `sort_order` vs `sort`
- [x] ✅ **DONE (mig 0086).** Audit corrected on inspection: the ordering outliers were `members.sort_order`,
  `contact_groups.sort_order`, `carnets.sort`, and `home_pins.sort` (NOT `routines` — it has no ordering column;
  and `home_pins` has only `sort`, not a redundant `sort`+`position` pair). All four renamed to `position` via one
  forward migration + every backend SQL reader updated. API JSON contracts preserved (members SELECT aliases
  `position AS sort_order`; carnets/home_pins keep their `sort` JSON field, aliased from the column). `RENAME COLUMN`
  syntax verified directly against local D1; typecheck + 797 tests + build green.

### DB-4 🟡→CONVENTION Recurrence schema split
- [ ] `events`/`tasks`/`home_projects` use `recur_json {freq,interval,weekdays}`; `schedule_blocks` uses separate
  `week_interval`+`anchor_day` columns, so `_lib/recur` can't be reused for it. **Forward rule:** new recurring
  entities use `recur_json`. Converging `schedule_blocks` is a real refactor (backfill + `carResolve` rewrite) —
  only if you're already in that engine. Note: the fortnight math is already shared via `recur.ts`/`weekActive`.

### DB-5 🟡 Member-attribution fragmentation
- [ ] Same "who" concept appears as soft-ref (`added_by`/`suggested_by`/`member_id`), hard-ish ref
  (`cook_member_id`/`last_done_by`), junction (`task_participants`), and dual (`member_id`+`author_member_id`,
  `member_id`+`author_label`). Don't rename existing columns; **do** write down the rule (DB conventions above)
  and apply it to new tables. Flag the one real confusion to document: `member_id` meaning *subject/scope* on
  notes/family_notes vs *author* elsewhere.

### DB-6 🟢→CONVENTION Household-config bloat
- [ ] `households` carries ~15 JSON/pref columns (meal slots, recipe pills, aisle order, cars, wifi, rules…).
  Fine for now. **Rule:** if you'd add a 5th-plus new pref, create a `household_preferences` table instead of
  another column on the tenant row.

### DB-7 🟢 Smaller items
- [x] ✅ `idempotency_keys.status` → **`status_code`** (mig 0089) — it's an HTTP status int, not workflow state;
  reader updated, rule written into CLAUDE.md schema conventions.
- [x] ✅ Soft-delete naming: `carnets.archived_at` **documented as a sanctioned exception** (reversible archive ≠
  `deleted_at`) in CLAUDE.md — left as-is, not aligned (aligning would be wrong).
- [x] Index coverage looks adequate; revisit only if a specific polled query shows up slow. *(No action — confirmed.)*

---

## 6. i18n & page structure

### <a id="i18n-1"></a>I18N-1 🟡 Duplicated translation values
Same string defined in many domain namespaces — change-one-forget-the-other risk.
- [x] "Enregistrer" ×6 (`list.save`, `board.saveDay`, `cercle.save`, `recipes.save`, `operator.saveLabel`,
  `common.save`), "Ajouter" ×5, "Retour" ×4, "Annuler" ×4, "Supprimer" ×4, "Modifier" ×3.
- [x] Consolidate generic verbs into `common.*`; keep a domain key only where the copy is genuinely
  context-specific. (Register is otherwise clean — courriel/dîner/souper all correct, no France-French slips.)

> ✅ **I18N-1 DONE 2026-06-26** — 19 bare-verb dup keys folded onto the 6 `common.*` verbs, 49 usages repointed
> across 27 files (+`i18n.ts`). Context-specific copy kept (`recipes.save`='Enregistrer la recette',
> `cercle.acceptSuggestion`, `cercle.pet.weightAdd`, `kid.backCollections`, `undo.action`='Undo'≠Cancel, `tour.*`).

### I18N-2 🟢 Structure
- [ ] Mixed flat keys vs nested objects across ~30 domains. Optional: document the nesting convention; not worth
  a churn pass.
- ✅ No meaningful hard-coded user-facing strings found — `useT()` adoption is essentially complete.

### <a id="struct-1"></a>STRUCT-1 🟡 Two full-screen-scene patterns + one outlier
- **`FormScene`** (create flows, injects member roster): EventFormPage, ChoreFormPage, HomeProjectFormPage,
  RoutineFormPage. **`SceneHead` + manual `<div class="scene">`** (15+ standalone/edit scenes). Both fine, but
  the split is undocumented and `RecipeFormPage` is a third, hand-rolled-modal outlier.
- [ ] Migrate `RecipeFormPage` off its hand-rolled `<h2>` header onto `SceneHead`/`Modal` (ties to [FE-2](#fe-2)).
- [ ] Document when to use `FormScene` vs `SceneHead` (consider an `EditScene` sibling that wraps the manual
  `.scene` layout so the 15 sites stop hand-rolling it).

### STRUCT-2 🟢 Already-uniform (recorded)
- ✅ All 6 hub tabs use `HubHead` + `useT()` + `queryHooks` + same loading/`PairPrompt` handling.
- ✅ All ~28 `operator/*` sections use `OperatorSection`; kitchen sub-tabs consistent; routing clean.

---

## Suggested execution order (waves)

- **Wave 1 (quick, high-confidence):** FE-1, FE-2/STRUCT-1, LIB-2, BE-1, BE-2, CSS-1, I18N-1. Write the DB
  conventions doc.
- **Wave 2 (opportunistic, per-call judgment):** LIB-1 triage, LIB-4, CSS-2, CSS-4, BE-3, `home_pins` sort/position.
- **Wave 3 (larger, schedule deliberately):** CSS-3 file split, LIB-3 util sweep, DB normalization/recurrence
  convergence only when already in that code path.

> Reminder: every change ships to `main` behind CI (typecheck/test/build) with **visual QA via `/dev/kit` +
> the e2e job** — these are UI-affecting refactors, so eyeball them, don't trust green tests alone.

---
---

# Part II — Feature & concept generalization

> Part I above is **mechanical** uniformization (use this primitive / token / key). Part II is the
> **higher-altitude** lens requested separately: *separate features that are really instances of ONE
> concept*, *concepts that exist in generalized form but aren't fully adopted*, and *near-general things
> worth promoting*. Produced 2026-06-26 by a second parallel sweep (notes/submissions · lists/board-cards/
> recurrence · under-adopted generalizations · synthetic-entities/media/search · guide+settings · add-system/
> tour-help).
>
> **Headline:** this codebase has unusually strong abstraction discipline. Most existing generalizations are
> **fully adopted with no gaps** (see the [✅ already-general](#-already-general-checked-no-action) list — these were
> verified, not skipped). The real opportunities are a handful of **behavioural layers** and **registries** that
> were never extracted, plus a few **schema shapes** that drifted. Severity here = **value / risk**, since these
> are larger than Part I's edits. Bias: prefer *forward conventions + small shared helpers* over big rewrites;
> several agent proposals are explicitly **rejected as over-abstraction** below.

## ⭐ Part II start-here (best value/risk)

1. **[P2-1] `createDeviceStore(key, default)` factory** — ~10 copy-pasted `useSyncExternalStore` localStorage stores. Pure boilerplate removal, low risk. **Do first.**
2. **[P2-2] `<BoardCard>` shell + a shared `DerivedOccurrence` shape** — every board glance card hand-rolls the same `.card`/`.sec-label` shell; birthday/work/carnet-life each return a different derived shape. Structural, low risk.
3. **[P2-3] `useItemList(key, endpoint)` behavioural hook** — ~9 household "small list" features re-wire the same add/check/clear/undo/deferred-removal logic.
4. **[P2-4] `staged_media` table + shared sweep** — `intake_media` + `postbox_media` are byte-for-byte isomorphic (table + cleanup). One table, one sweep.
5. **[P2-9] Help/explainer build-time orphan check** — the memory records real shipped ORPHAN bugs (a "?" target with no entry renders nothing). A typed registry that fails `tsc` kills the bug class cheaply.

---

## A. Behavioural layers never extracted (UI primitives exist, behaviour duplicated)

### <a id="p2-3"></a>P2-3 🟡 (high value / low-med risk) `useItemList` — the "household small list" concept
~9 features are "a household-scoped list of little rows": `list_items`, `pantry_low`, `pantry_use_soon`,
`pantry_reserve`, `meal_leftovers`, `meal_ideas`, `todos`, `home_projects`, `care_log`. The **UI** layer is
already shared (`CheckRow`/`ListRow`/`EditField`/`RowActions`/`EmptyState`). The **behavioural** layer is
re-coded per list: query + live-poll setup, `useDeferredRemoval`, add-via-text-or-`EntityCombobox`, the
"primary action" (check / check-and-side-effect / mark-done / plan-elsewhere), undo.
- [ ] Extract `useItemList(queryKey, endpoint, {live})` bundling query + `useDeferredRemoval` + add/remove writes,
  and an optional `<ItemList>` whose row delegates the primary action to a caller callback. Migrate PantryTab,
  TodoSection, MealIdeas, Leftovers first.
- **Keep per-list (don't over-merge):** what "check" *means*, editable columns, whether reorder/voice is enabled.
- **Calm:** unifies chrome + undo across lists; adds no counts/badges. Do NOT merge the *tables* (Part I DB notes).

### <a id="p2-1"></a>P2-1 🟡 (high value / low risk) `createDeviceStore` — the per-device setting factory
~10 localStorage stores (`ambient`, `boardCards`, `apod`, `canvas`, `cookPrefs`, `measurePrefs`, keep-awake,
per-behaviour ambient opt-outs, …) each hand-roll the identical `useSyncExternalStore` shape: interface →
defaults → KEY → listener Set → cache → read/snapshot/subscribe → `useXxx` hook (~58 LOC each, e.g. `lib/ambient.ts`).
- [ ] Extract `createDeviceStore<T>(key, defaults)` → `{ use, set, reset }` (model it on `useBoardCards`'s
  reconcile-on-read so a new field auto-appears). Refactor `ambient`/`boardCards`/`apod` as the proof, then the rest.
- [ ] Add a `toggleField(name)` helper on it to absorb the ~8 hand-rolled on/off toggles.

### P2-5 🟡 (med value / med risk) `useHouseholdListSetting` — the household-JSON setting concept
8 settings live in `households.*` JSON columns and split across **three** write patterns (React-Query+useMutation;
useState+useWrite+undo; useState+`api()`+invalidate): `recipeTags`, `recipePills`, `meals` (slot colours/hidden),
`aisles`, `cars`, `reserve`, household name, household pets. Each re-implements GET→merge→PATCH + a list editor.
- [ ] Converge on one pattern and extract `useHouseholdListSetting(field, {idKey, colourKey?, draggable, renameable})`
  returning `{data, add, rename, recolour, remove, reorder}`. Pilot on `cars`/`reserve` (they already "mirror each
  other deliberately"). Folds in the duplicated colour-override merge (`useColorOverride`) too.
- ⚠️ Doesn't fix the known last-write-wins across two operator tabs (server optimistic-locking is out of scope;
  one-operator assumption stands).

---

## B. Registries / shapes that drifted

### <a id="p2-2"></a>P2-2 🟡 (high value / low risk) `<BoardCard>` shell + `DerivedOccurrence` shape
Two related drifts:
- **Card shell:** `ARegler`, `AutoCard`, `CarnetsCard`, season card, `CercleBirthdays`, etc. each hand-roll the
  same `<div class="card">` + `.sec-label` header + empty-hide. `useBoardCards` already generalizes *layout*; the
  *card contract* isn't. → [ ] Extract `<BoardCard icon label tint empty>` and adopt.
- **Derived shape:** `birthdayOccurrences()`, `carResolve.workOccurrencesInRange()`, `carnetLife` all produce
  "a date + label + metadata" in **different** shapes, re-wrapped per consumer. → [ ] Define one
  `DerivedOccurrence {id, at, label, kind, …}` (stable `kind:source:…` id) that board/month/day consume uniformly.
  This is the read-side companion to Part I **DB-4** (recurrence) and unblocks future derived signals cheaply.

### <a id="p2-4"></a>P2-4 🟡 (med value / med risk) `staged_media` — unify the guest submission media pipeline
`intake_submissions`+`intake_media` and `postbox_submissions`+`postbox_media` implement an **identical**
quarantine→stage→review→materialize→7-day-orphan-sweep pipeline; the two `*_media` tables and their cleanup
queries are isomorphic (~50 LOC dup).
- [ ] Migrate to ONE `staged_media(…, submission_kind)` table + extract `sweepAbandonedStagedMedia()` into
  `_lib/stagedMedia.ts`, called by both `/api/intake` and `/api/postbox`.
- **Keep separate:** the two *submission* tables + review UIs (`IntakeReview` structured-payload merge vs
  `PostboxReview` flat accept) — their payloads are genuinely different. `ReviewChecklist` already shares the UI seam.

### P2-6 🟡 (med value / med risk) `things.ts` — one "given a thing, pick its colour/icon/emoji" registry
Resolution is mostly centralized (`pictoFor` 350-entry grocery table, `aisleFor` reusing it, `CATS` category
tints, carnet `KIND_EMOJI`, `PIN_EMOJI`) — **but fallbacks are scattered and drift**: pet default `#C7873F`
hardcoded in `SearchPage`, business/work/recipe-tag colours each have their own fallback in different files. A
palette change means hunting multiple files.
- [ ] Centralize `THING_DEFAULTS: Record<ThingKind,{icon,colour}>` + `colourFor/iconFor/emojiFor(thing)` (delegating
  to `pictoFor` for grocery items, `CATS` for categories). Rewrite the hardcoded fallbacks to call it. Keep
  `pictoFor` as-is (it's excellent and domain-specific).

### P2-7 🟢 (med value / low risk, **Phase 1 only**) `SEARCHABLE_INDEX` — the searchable-entity contract
`/search` matches ~13 kinds client-side via `fold()`, but each kind's indexed fields are chosen ad-hoc inline in
`SearchPage`. Risk: a new feature silently ships **unsearchable** because nobody added a fold-check.
- [ ] **Phase 1 (do):** extract `SEARCHABLE_INDEX: Record<Kind, (e)=>string>` so adding a kind = one entry; document
  "searchable = has an index entry." Low-risk refactor.
- [ ] ❌ **Phase 2 (reject for now):** server-side search index, guide-moved-to-DB, ingredient index. Over-engineering
  at ~15–30 households; client-side warm-cache search is a *feature* (offline). Revisit only if a household's set
  gets large enough to lag per-keystroke.

---

## C. Document-the-pattern (don't extract code)

### P2-8 🟢 Memo & attribution patterns — keep separate, write the rules down
- **Notes family:** `notes` (transient/board), `family_notes` (durable/cercle), `day_notes` (date-anchored, no
  media) are **correctly separate** (different durability/scope/visibility). `MemoControls` already shares the
  composer via `endpoint`/`affectedKey`/`extraBody`. → [ ] Document the **memo media lifecycle**
  (`media_kind`+`media_key`+`scene_key`, upload→{key}→clear-frees-blob) in `_lib/memoMedia.ts` + a `MemoComposerProps`
  type; optionally a calm-style test asserting `media_key` exists iff `media_kind` set. No table merge.
- **Attribution ("who"):** member soft-ref vs `author_member_id` vs external `author_label`/`sender_name` are each
  right for their context (postbox's name→member tint-on-exact-match is the model for future guest→household flows).
  → [ ] Document the three patterns (ties to Part I **DB-5**); don't unify code.

### <a id="p2-9"></a>P2-9 🟡 (med value / low risk) Help/explainer: kill the orphan-bug class + curb drift
The guide/help **system** is already excellent — `GUIDE`/`CONCEPT_THEMES`/`FEATURE_MAP_TILES` is one taxonomy that
tours (`guideWhat`), `SectionIntro`, and `FeatureMap` all reuse. Two real gaps remain:
- [ ] **Orphan check:** `ADD_HELP`/`CERCLE_HELP` keys and `data-tour` anchors are untyped strings; a "?" target with
  no entry renders nothing (memory records this shipping more than once). Add a typed registry / build-time assertion
  so an unregistered target fails `tsc`. Consider one `data-help="<key>"` namespace shared with tour anchors.
- [ ] **Drift:** `ADD_HELP`/`CERCLE_HELP` carry their **own** one-liners separate from `GUIDE.what`, so they can
  diverge. Low priority: have help bubbles pull the summary from the guide entry (like tours already do via
  `guideWhat`). The big "one FeatureExplainer registry feeding guide+help+tour+intro" is **deferred** — high churn,
  the copy already exists; only worth it at the next onboarding refresh.
- [ ] **Adoption template:** only AddSheet + Cercle wire help-mode; Board/Kitchen/Routines/Liste haven't. Add a short
  "how to add section help" scaffold doc so adoption is uniform (no new registry shape needed).

### P2-10 🟢 Add-system: capture spine is well-generalized; two small folds
The ＋ capture spine (`SECTION_MODES`/`NAV_TARGET`/`MODE_DRESS`/`FORM_ROUTES`, one `<AddSheet>` mounted in
`HubLayout`, `/share` + `QuickAddPage` as companions on the same endpoints) is a **model generalization**. Minor:
- [ ] Fold the bespoke **kitchen-week actions** (currently injected via `kitchenActions` context + a hard-coded
  second grid in AddSheet) into a declarative `SECTION_ACTIONS` registry sibling to `SECTION_MODES` (keep the
  state-dependent flags). Low.
- [ ] (Optional, low priority) Share the inline-add submit handlers (`submitList`/`submitPantry`/`submitReserve`/…)
  via an `ADD_HANDLERS[mode] = {endpoint, formatBody, affectedKeys}` map — also de-forks ReserveSection's inline
  add. Medium risk (form variations), defer unless touching that code.

---

## D. Re-evaluated under "only 1 real household exists today"

> **The insight (2026-06-26):** with a single real household, **data-migration risk is ~0** and *this is the
> cheapest window we will ever have* to fix schema drift — a backfill touches one row. That flips the items that
> were blocked **on migration risk**. It does **not** flip items blocked on *runtime over-engineering* or
> *permanent code-indirection* — those costs are the same at 1 household or 1000. Re-verdicts below.

### D.1 ✅ Now worth doing — the migration window is the whole reason they were deferred
Do these **soon, while there's one row to migrate** (and a thin app to update). Each is still real *code* churn
(every SQL reader), but that's a finite one-time cost on a young codebase, and it never gets cheaper than now.
- [ ] **Part I DB-4 — converge recurrence onto `recur_json`.** The explicit blocker was "backfill `schedule_blocks`
  + rewrite `carResolve`." Backfill is now trivial (or just drop/recreate the handful of rows). Worth it: it lets
  `_lib/recur` serve every recurring entity and pairs with P2-2 `DerivedOccurrence`. **Upgraded from forward-only → do now.**
- [ ] **Part I DB-2 (`color`→`colour`) + DB-3 (`sort_order`/`sort`→`position`).** Pure naming drift; the only reason
  to defer was "rename touches every reader on live data." Data risk gone → do the renames now so the schema stops
  carrying both spellings forever. (Still verify each query; it's code churn, just no data danger.) Also fix the
  genuine `home_pins` `sort`+`position` redundancy.
- [ ] **Part I DB-1 media columns — rename to the `media_kind`/`media_key`(+`scene_key`) convention** across the
  single-column stragglers (`photo_key`/`r2_key`/`image`). Same logic: cheapest now. (This is the *column rename*,
  NOT the polymorphic table — see D.3.)
- [ ] **`household_preferences` split (Part I DB-6)** — copying ~15 JSON cols off the tenant row is a 1-row move
  today. Modest value (tenancy vs prefs separation), low cost now. Bundle it with **P2-5** if you build
  `useHouseholdListSetting`; skip if you're not touching settings anyway.

### D.2 ✅ Promote regardless — was never really a data question
- [ ] **`attachmentsFor(kind,id)` / `deleteAttachments(kind,id)` helper** (the worthwhile slice of the
  media-attachments idea). Backed by the **existing per-row columns** — no new table. Centralizes the currently
  hand-rolled, leak-prone delete paths (recipe step images, care-log media, drawing media+scene) into one audited
  helper. Low risk, fixes real orphan-blob leaks. This is the part of the "media_attachments" proposal that was
  always worth it.

### D.3 ❌ Still rejected — household count doesn't change the cost
The cost here is permanent indirection or runtime value, not migration:
- **Full polymorphic `media_attachments` table** — its cost is **read-path** indirection *forever* (every image
  display becomes a join), unchanged by data volume. Per-row columns + the D.2 delete helper get the value without it.
- **Server-side search index** — scale-driven; a calm finite-list household never needs it. Client warm-cache search
  is a *feature* (offline). (P2-7 Phase 1 contract still yes.)
- **Guide-in-DB** — adds a fetch + i18n plumbing for zero benefit; *worse* at 1 household, not better.
- **Merging the note tables, or the submission *payload* tables** — genuine semantic differences (durability/scope;
  structured-intake vs flat-postbox). Unchanged. (The `staged_media` *media* merge, **P2-4**, is still yes.)
- **Generic `DerivedEntity<T>` server abstraction** — indirection without payoff; the concrete `DerivedOccurrence`
  (P2-2) is enough.
- **`entity_audio` table** — low value (recipe `lang` covers the real case); cheap to add later *if* per-entity
  narration ever spreads. For now just document `resolveNarrateLanguage(entity, householdLang)` ordering
  (entity.lang → household read-lang → UI lang). Revisit only on demand.

---

## <a id="-already-general-checked-no-action"></a>✅ Already-general — checked, no action (so we don't re-audit)

The sweep **verified** these are fully adopted with no meaningful outliers:
- **`useEntityDetail` + detail adapters** — every list/card peeks; Notes & carnet-scene correctly excluded (media-first / too-rich-for-a-peek).
- **Guest `kind` + path-allowlist share model** — all 6 share surfaces use it; no un-adopted external view.
- **FeatureMap single taxonomy**, **EntityCombobox**, **ReviewChecklist**, **MemberSwitcher/FaceSelect**,
  **usePointerDnd/DragPill** — no hand-rolled outliers found.
- **`useSpeak`/TTS** (one hook, lang-resolution, lazy-voice, emoji-strip, audio-fallback) and **`uploadMedia`/
  `deleteR2Blob`** (one upload entry, one best-effort delete) — strong; only the small docs in P2-8/D above.
- **Guide/help content taxonomy** and the **capture spine** — model generalizations (P2-9/P2-10 are polish only).
- **Lone defensible outlier:** `CookMode`'s hand-rolled step sequencer vs `RoutinePlayer` — its parent density/
  layout/gather needs differ enough that merging would over-broaden. Leave; add a comment linking the two concepts.

## Part II execution order
- **Wave 1 (cheap, isolated):** P2-1 device-store factory · P2-2 `<BoardCard>`+`DerivedOccurrence` · P2-9 orphan check + adoption doc.
- **Wave 2 (behavioural, needs QA):** P2-3 `useItemList` · P2-5 `useHouseholdListSetting`+colour helper · P2-6 `things.ts` · P2-7 Phase 1.
- **Wave 3 (schema, schedule deliberately):** P2-4 `staged_media` · P2-10 folds · the Part I DB conventions doc.

---
---

# Global execution roadmap (Part I + Part II combined)

> The per-section waves above are *local* views. This is the **single recommended order** across both parts,
> sequenced by dependency and risk. Core logic: **mechanical UI first** (momentum, no schema) → **schema cleanup
> while the 1-household window is open** (so later helpers target final column names) → **behavioural extractions
> on the clean schema** → **registries / contracts / polish**. Do one item per commit, push to `main`, let CI gate,
> eyeball via `/dev/kit` + the e2e job. Tick the boxes in this file as you land each.

### Phase 0 — Foundations (do first; unblocks later phases, near-zero risk)
1. **Schema Conventions doc** ([DB conventions](#db-conventions-forward-rules)) — write the naming rules into CLAUDE.md/`bmad/` *before* the renames so they follow one spec. Gates Phase 2.
2. **LIB-2** — centralize inline query keys into `lib/queryKeys.ts` (`['members']`×11, `['board']` inline, …). Mechanical, foundational, prevents cache drift.
3. **BE-2** (`isValidR2Key` extract) + **BE-1** (defensive `household_id` on the 3 loop-deletes). Tiny, isolated backend.

### Phase 1 — Mechanical UI / CSS / i18n (high-confidence, validates the visual-QA loop)
4. **FE-1** hand-rolled `.subtabs` → `<SubTabs>` (5 sites).
5. **FE-2 + STRUCT-1** the three recipe overlays → `<Modal>` (retires the `RecipeFormPage` header outlier).
6. **CSS-1** token sweep (`999px`→`--radius-pill`; `#fff`/`#000`→semantic — fixes real night-mode bugs).
7. **I18N-1** consolidate duplicated verb labels into `common.*`.

### Phase 2 — Schema cleanup (TIME-SENSITIVE: cheapest while 1 household; batch it, one rename = one migrate+typecheck+e2e loop)
8. **DB-3** `sort_order`/`sort` → `position` (+ drop the `home_pins` redundancy) — smallest rename, proves the painless-migration assumption.
9. **DB-2** `color` → `colour` (cols + JSON keys).
10. **DB-1** media columns → `media_kind`/`media_key`(+`scene_key`) (rename only, **not** the polymorphic table).
11. **DB-4** converge `schedule_blocks` recurrence onto `recur_json` (backfill is trivial now) — last, it's the biggest, and it sets up P2-2.
12. **DB-7** small items (idempotency `status` comment, `carnets.archived_at` align) while in the migrations.

### Phase 3 — Behavioural extractions (the real generalization payoff, on the now-clean schema)
13. **P2-1** `createDeviceStore` factory (isolated; do first here).
14. **P2-2** `<BoardCard>` + `DerivedOccurrence` (reads cleaner after DB-4).
15. **D.2** `attachmentsFor`/`deleteAttachments` helper (fixes orphan-blob leaks; uses existing columns).
16. **P2-3** `useItemList` behavioural hook (after DB renames so it targets final columns).
17. **P2-5** `useHouseholdListSetting` + `useColorOverride` — **bundle DB-6** `household_preferences` split here (1-row move).
18. **P2-6** `things.ts` colour/icon/emoji registry (after DB-2 so it keys on `colour`).

### Phase 4 — Registries, contracts, polish (opportunistic; no hard ordering)
19. **P2-9** help orphan build-check + section-help adoption doc.
20. **P2-7 Phase 1** `SEARCHABLE_INDEX` contract.
21. **P2-4** `staged_media` table + shared sweep.
22. **P2-10** add-system folds (`SECTION_ACTIONS`; optional `ADD_HANDLERS`).
23. **P2-8** document memo-media + attribution patterns (ties to DB-5). **DB-5** doc.
24. **LIB-1** `api()`→`useWrite()` triage · **LIB-4** media-upload helper · **LIB-3** util-dup sweep.
25. **CSS-2** merge dup classes · **CSS-4** `.btn` variants · **CSS-3** `pages.css` split (large) · **CSS-5** · **FE-3** KidExitGate · **BE-3** · **I18N-2** · **STRUCT-1** `EditScene`.

### Explicitly NOT now
Everything in [Part II §D.3](#d3--still-rejected--household-count-doesnt-change-the-cost) — polymorphic media table, server search index, guide-in-DB, table merges, generic `DerivedEntity<T>`, `entity_audio`. Re-read D.3 before reviving any of them.

> **Standing rules for whoever executes this:** reuse-first (extend a primitive, don't fork — read the section +
> `COMPONENTS.md` + `/dev/kit` first); every change mobile- AND tablet/toddler-friendly; calm tenets are
> non-negotiable (no counts/streaks/points/push/inventory — a test enforces it); push straight to `main`, fix
> forward. Don't trust green unit tests alone — check the e2e job on the run page.
