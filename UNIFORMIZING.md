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
- [x] ✅ `components/kitchen/RecipesTab.tsx` (~L328, `.subtabs subtabs--mini`) → `<SubTabs size="mini">` **DONE
  2026-06-26.** The Aa/Collections toggle now uses the shared primitive. Two wrinkles handled: (1) both tabs share
  the single `'collections'` help entry, so `pick` is wrapped to pin that key (ignoring the per-tab key) — else the
  `'aa'` tab would request a non-existent entry (a P2-9 orphan); (2) the sibling `.recipe-view-toggle__book` button
  lives in a bespoke unified pill, and `<SubTabs>` adds a `.subtabs-row` wrapper (own gap + bottom margin) that would
  distort it — neutralized with one rule `.recipe-view-toggle .subtabs-row { display: contents }`, making the wrapper
  layout-transparent so the rendered classes (`subtabs subtabs--mini` / `subtabs__opt is-on`) and 3-segment layout are
  byte-identical to before. typecheck + build green.
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
- [x] ✅ `components/RecipeReadReview.tsx` → `<Modal className="read-review">` **DONE 2026-06-26.** Dropped the
  hand-rolled `createPortal` + `.read-review__scrim` + `.read-review__card` + `.read-review__bar` + local `useModal`;
  the dialog now rides `<Modal>`'s shared chrome (backdrop, ✕ close, focus-trap, Esc) with `title={reviewTitle}`. CSS:
  removed the outer `position:fixed`/scrim/56rem-card/bar rules; added a `.kit-modal.read-review` override that
  restores the WIDE two-pane width + the pinned header/hint/footer + scrolling-body model (kit-modal's default is a
  whole-card scroll, which would let the confirm footer scroll away), and styles `kit-modal__title` to match the old
  bar. `__hint`/`__body`/`__foot` kept (each carries its own padding, so the `padding:0` card is correct). typecheck +
  build green. ⚠️ **Not in the screenshot suite** (appears only mid OCR-import with low-confidence words) — structure
  reproduced 1:1; worth a manual eyeball on the next photo import.
- [~] `RecipeFormPage.tsx` hand-rolled `<h2>` → **no change**: the page is a thin route wrapper with no `<h2>` of its
  own; the STRUCT-1 `<h2>` lives inside RecipeForm's `.recipe-modal__bar` (a scene), so it rides the scene-wrapper work.

### FE-3 🟡 `KidExitGate` bespoke modal
- [x] ✅ `components/KidExitGate.tsx` **DONE 2026-06-26.** Wrapped in `<Modal open={gateOpen} className="kid-exit-modal"
  title={exitTitle}>` — dropped the hand-rolled `.kid-exit-overlay` scrim + `.kid-exit-modal` card surface + the local
  `useModal`/`modalRef`; the gate now rides Modal's shared backdrop/✕/focus-trap/Esc. **Security unchanged** — the
  one-way door is the 3s hold + the arithmetic answer (untouched); Modal only swaps the presentation chrome (Esc/✕ just
  *cancel*, never unlock). Passed `className="kid-exit-modal"` so the card keeps its class → the inner
  `__q/__input/__wrong/__actions` CSS **and the e2e gate test** (`interactions.spec.ts:150`, which locates
  `.kid-exit-modal`) still hold. CSS: removed the overlay + dead `__title` rule, kept a one-line
  `.kit-modal.kid-exit-modal { width: min(360px,100%) }` override. typecheck + **gate e2e passes** + build green.

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
- [x] ✅ **In-file dupes DONE 2026-06-26 — 3 genuine, 2 false positives.** Merged the 3 real same-selector splits
  (all provably **zero-visual-change** — the cascade already determined the result): `.recipe-meta-row` (recipes.css:
  L338 was fully shadowed by L808 → deleted the dead block), `.auto-card` (pages.css: folded a standalone
  `--sec-tint` decl into the base block), `.sky-tonight--kid` (photos.css: folded `cursor:pointer` into the variant
  block). **`.now-card--moment` (today.css) and `.tdl-finish` (kid.css) are NOT dupes** — each is a grouped base
  (`.now-card--regler, .now-card--moment` / `.tdl-start, .tdl-finish`) + a variant-specific block, the normal
  shared-base pattern; merging would *duplicate* the base. Left. typecheck + build green.
- [x] ✅ **Cross-file dupes REVIEWED 2026-06-26 — premise largely overstated; 1 real redundancy removed.** Read both
  sides of all five pairs. **Four are deliberate complementary layering, NOT shadows to delete** (the second file
  contributes real, non-redundant declarations — there is nothing to "merge"):
  - **`.hub`** — hub.css owns the structural layout (`display:flex; height:100%; position:relative`); pages.css has
    only `.hub{font-size:1.05rem}` + a large block of `.hub <descendant>` **kiosk** tap-target/font bumps. Zero
    property overlap. (Those kiosk overrides belong next to the kiosk block in pages.css — moving them buys nothing.)
  - **`.bigtile`** — pages.css defines the whole tile; almanac.css adds only `border-radius:var(--radius-lg)`. A
    deliberate single-prop override in the almanac context.
  - **`.today-hero`** — pages.css defines the hero; almanac.css adds only `transition`. Complementary.
  - **`.avatar`** — a genuine two-element collision (today.css's 50px section disc w/ `--help` pip vs photos.css's
    generic component w/ `--photo`/`__initial`); the cascade merges them (photos wins `border-radius`+`display`).
    Stable as-is — the section disc relies on the 50px default, the generic `<Avatar>` sets its own size. Splitting
    is a class-rename refactor (touch TSX), not a shadow-delete; **left as-is, documented.**
  - **`.kid`** — the ONE true redundancy. pages.css's bare `.kid{min-height:100vh; display:flex; flex-direction:
    column}` was **fully inert** (kid.css imports later → its `min-height:100%` won; the other two props identical).
    **Removed** (provably zero-visual-change), comment added pointing to kid.css as canonical. typecheck + build green.

### CSS-3 🟢 `pages.css` is a 3.7k-line kitchen sink (423 classes, 19% of all CSS)
- [x] ✅ **DONE 2026-06-26.** Split `pages.css` (3709 lines) into **eleven contiguous per-topic slices** under
  `src/styles/pages/` (`routines-overview`, `kitchen`, `kid-routines`, `onboarding`, `operator`, `fields`, `hub`,
  `aujourdhui`, `recipe-tags`, `guide`, `scenes`) and replaced the single `@import` with the eleven in original
  top-to-bottom order. **The risk the deferral feared — silent cascade regression — is eliminated by construction,
  not just QA'd:** the slices are *contiguous* and imported *in order*, so their concatenation is **byte-identical**
  to the old file (verified by md5: reassembly === original), and Vite inlines `@import` in place, so the produced
  bundle is the same bytes in the same order. Each cut sits between rules (preceding line is `}` or blank → every
  slice parses standalone). Verified: md5-identical reassembly, `npm run build` green, representative screenshots
  (board/kitchen/settings @wall + a toddler frame) unchanged.
- [x] ✅ **`sheets.css` + `board.css` split too (2026-06-26), same byte-identical method.** `sheets.css` (2385 lines)
  → `src/styles/sheets/{capture,help,list,scene,flyer,list-actions,cashier}.css`; `board.css` (1933 lines) →
  `src/styles/board/{grid,views,notes,drawpad,gallery,month}.css`. Both reassemble md5-identical to the originals;
  `npm run build` green; `board.css` stays imported after `photos.css` (ambient relies on it). Navigation comments
  that named the old files (`kitchen/ghost/detail/ambient/month.css`, `FlyerViewer.tsx`, COMPONENTS/AUJOURDHUI) were
  repointed to the owning slice. The three big CSS kitchen sinks are now all split.

### CSS-4 🟡 Ad-hoc button-like elements bypassing the `.btn` family
- [~] **SKIP 2026-06-26 — premise reviewed and rejected (don't fold onto `.btn`).** Read all five sites; the
  proposed "extend `.btn` with `--text` + `--dashed`" doesn't fit and would make the cascade *more* fragile, not
  less:
  - **`.routine-card__run` is neither** — it's a **filled, per-tint button** (`color:#fff`,
    `background:color-mix(var(--tint) 78%…)`, `box-shadow`), closest to `.btn--primary` but keyed off the card's
    `var(--tint)` not `var(--accent)`. No `--text`/`--dashed` variant applies.
  - **The two "text" buttons diverge from each other** — `.board-focus__all` (underline, `--ink-soft`, `padding:4px
    6px`) vs `.disclosure__summary` (no underline, `--ink-faint`, `font-size:.85rem`, `padding:.25rem .1rem`, plus
    `__caret`/`__count` children). A single `.btn--text` couldn't serve both without per-site overrides.
  - **`.btn` base is a solid 44px bold pill** with `:hover{background:var(--paper)}` + `:active{transform+shadow}`.
    Any of these flat/dashed elements folded onto `.btn--*` must override ~8 of the 13 base declarations **and**
    cancel the hover-background + press-transform — the classic inherit-then-override-everything anti-pattern. Net:
    more CSS, more cascade-order fragility, and 5 restyled interactive tap targets for **zero** user-visible gain.
  - **The one genuine micro-dup** is the dashed-pill *slot* family — `.kitchen__note-add` / `.kitchen__slot` /
    `.kitchen__slot-add` (audit named 2; there are 3) share `border:1px dashed var(--line)` + transparent +
    `radius-pill` + `cursor:pointer`. If ever consolidated it's its own small `.slot`/editable-slot base (common
    decls grouped, per-class diffs kept — `.is-set`, ellipsis label, colour/min-height), **not** a `.btn` variant.
    Low value, skipped for now. These elements *deliberately* don't read as the app's solid `.btn`.

### CSS-5 🟢 Convention-only
- [ ] BEM drift (`__`/`-`/camelCase mixed) — standardize on `.block__el--mod` for *new* CSS; document in core.css.
- [x] ✅ **Undefined-token fallbacks DONE 2026-06-26.** `--surface-2` + `--hairline` were referenced but **never
  defined** anywhere, so all ~8 callers used drifting hardcoded black-alphas (`rgba(0,0,0,0.02–0.08)`) — invisible/wrong
  on a dark night card. **Defined both as theme-aware tokens** in core.css (`color-mix(in srgb, var(--ink) 5%/8%,
  transparent)`): day ≈ the prior black-alpha, night now a correct subtle light lift. Made the token authoritative at
  every site (dropped the redundant fallbacks across photos/detail/carnets/intake/sheets) and fixed the **one semantic
  outlier** — `sheets/list.css` `.list-sort__seg`-track wanted an *opaque* panel, so it's pinned to `var(--card)` directly,
  not the overlay token. typecheck + build green; night-tint shift gated by the e2e screenshot suite.
  - [~] **`var(--accent, #…)` "wrong fallback" — premise moot, no action.** `--accent` IS always defined
    (core.css:54 + per-theme), so every `var(--accent, #2a8f85)` fallback is **dead text** that never renders — not a
    "wrong colour." Harmless; an optional cosmetic cleanup (drop ~10 dead fallbacks), not a bug. Left.
- [ ] Add a `--text-xs…--text-lg` size scale; replace scattered `0.78/0.82/0.85/0.9rem`. **Deferred** — larger
  app-wide sweep, optional, low value; do as its own pass if ever touching typography broadly.

---

## 3. lib/ helpers & cross-cutting conventions

### LIB-1 🟡 Writes via `api()` instead of `useWrite()` (offline-outbox bypass)
The sweep found ~50 direct `api()` write calls. **Triage required — several are legitimately exempt:**

- **Genuinely exempt (leave, but add a one-line comment noting why):** auth flows (`Login.tsx`,
  `auth.tsx` logout) and anything that runs before/around the session can't go through the household outbox;
  fire-and-forget telemetry (`aiErrorToast.tsx` posting an AI-error journal) shouldn't be queued/retried offline.
> **Rule decided 2026-06-26: user content → `useWrite()`; device/household toggles → `api()` OK.** A write that
> creates/edits/deletes *household content a person would expect to survive a flaky connection* goes through the
> outbox (optimistic + queue-offline + invalidate). A tiny *device/household preference* PATCH (AI on/off, measure
> colours) that's meaningless offline and self-correcting may stay `api()` — migrating buys nothing.

- [x] ✅ **LIB-1 TRIAGE COMPLETE 2026-06-26.** Migrated every genuine *user-content* write (loves, gallery-delete,
  AddSheet ×3, PriceMatchPage ×2 — see below); the rest resolve to `api()`-OK under the decided rule, each documented:
  - [~] `components/operator/IntakeReview.tsx` (~9 calls) — **stays `api()` (operator online review).** Accept/merge/
    dismiss of *quarantined guest submissions* is an inherently-online desk workflow (you're reviewing content that
    just arrived over the network); offline-queueing an operator merge is near-zero value and the per-call optimistic
    shapes are non-trivial. On the "self-correcting, online" side of the rule.
  - [~] `lib/ghost.ts` `patchGhost`/`deleteGhost` — **stays `api()` (operator settings-management).** These are
    module-level (non-hook) fns driving Réglages ▸ Magasinage staple/cadence management + a QuickAdd suggestion-mute;
    operator-only, online, self-correcting via invalidate. Migrating would force a hooks conversion across 5 call
    sites for a household-config write that sits on the `api()`-OK side of the rule.
  - [x] ✅ `lib/drawingGallery.ts` **PARTIAL DONE 2026-06-26** (audit names were stale — the real fns are
    `useSaveToGallery`/`useUpdateInGallery`/`useDeleteFromGallery`). Migrated **`useDeleteFromGallery` → `useWrite`**
    (optimistic removal from `GALLERY_KEY` + queue-offline + reconcile). **Left on `api()` by design:** the save +
    update writes are atomically coupled to an R2 blob upload (`uploadDrawing`) that must succeed first and itself
    can't be queued — routing the trailing POST/PATCH through the outbox would split a 2-step op across online/offline
    (a queued row with no blobs). Commented in-file. typecheck + 799 tests + build green.
  - [x] ✅ `lib/loves.ts` (recipe ❤ toggle) **DONE 2026-06-26** — `useWrite` + an optimistic flip of the active
    profile's love (`optimistic` writes `LOVES_KEY`, `affectedKeys:[LOVES_KEY]` reconciles); the heart now updates
    instantly and survives offline instead of only invalidating online. typecheck + 799 tests green.
  - `lib/measurePrefs.ts` (household PATCH), `lib/ai.ts` (AI toggle PATCH) — **per the rule above these are
    device/household toggles → may stay `api()`** (tiny, online-only-ish, self-correcting).
  - [x] ✅ `components/AddSheet.tsx` (3) **DONE 2026-06-26** — migrated the `list` / `pantry` / `meal-leftovers`
    content adds from bare `api()` to `useWrite` (`affectedKeys` replaces the manual invalidate), matching the file's
    own todo/reserve adds so the ＋ capture spine queues + replays offline uniformly. **Left on `api()` by design:** the
    `capture` POST (AI routing) returns the server's classification the UI displays — an online-only AI round-trip,
    not a queueable write. typecheck + targeted e2e (list/pantry/leftover add) + build green.
  - [x] ✅ `pages/PriceMatchPage.tsx` (2) **DONE 2026-06-26** — the in-store price-match `list` PATCH (attach a deal)
    + POST (add an item) → `useWrite` with `affectedKeys:[BOARD_KEY]`. In-store signal is flaky, so these genuinely
    benefit from queue + replay. typecheck + e2e (pricematch sheet) + build green.
  - [~] `pages/SharePage.tsx` (2) — **stays `api()` by design.** One is R2-coupled (the shared photo → fridge note
    needs the `note-media` upload's `media_key` first, like drawings — non-queueable two-step); the other is the
    `capture` AI-routing POST (online-only round-trip). Neither is a queueable content write.
  - [~] `components/cercle/ContactPhotos.tsx` — **stays `api()` (R2-coupled photo POSTs)**, same reasoning as the
    drawing/share media writes (the blob upload must succeed first and can't be queued). See also LIB-4.

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
- [x] ✅ **VERIFIED CLEAN 2026-06-26 — no action.** Each named category resolves to a SINGLE source: `imgUrl`
  (`lib/image.ts`), the local-day trio `localDayStart`/`addLocalDays`/`localDayOfWeek` (`lib/localDay.ts`),
  `slotLabel` (`lib/mealSlots.ts`). Member display-name "resolvers" are tiny per-component closures
  (`members.find(...)?.display_name`), not exported dups worth extracting. A sweep of every `lib/` export found
  only ONE name collision — `TOD_ICON` in `cats.ts` vs `routineTod.ts` — and they hold **intentionally different**
  icon sets (general time-of-day vs kid-routine), so they're a name clash, NOT a duplicate; consolidating would be
  wrong. Prior audits' consolidations confirmed un-regressed.

### LIB-4 🟡 Media upload not always via `uploadMedia()`/`useMediaUpload()`
- [x] ✅ **DONE 2026-06-26 — 2 of 4 were already migrated (audit stale).** `ContactPhotos.tsx` already uses
  `useMediaUpload`; `operator/media.tsx` already uses `uploadMedia`. Migrated the two that were still hand-rolling:
  `operator/household.tsx` avatar (`resizeImage(file, AVATAR_MAX)` + `api(POST, blob)` → `uploadMedia(ep, file,
  {resize: AVATAR_MAX})`) and `lib/drawingGallery.ts` PNG (→ `uploadMedia('note-media', png, {resize:false})` for
  uniform 503→`MediaUnavailableError`). **Left:** the drawing **scene** blob is a JSON sidecar, not an image —
  routing it through a media-upload helper would mis-frame it, so it stays a raw `note-media` POST. typecheck +
  799 tests + build green.

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
- [x] ✅ **DONE 2026-06-26.** Dropped the redundant `if (ctx.env.PHOTOS)` guards before `deleteR2Blob()` in
  `care-log.ts:208` / `home-pins.ts:131` (the helper already no-ops on an unset bucket); kept the `owns` row-guard,
  added a one-line comment noting why no env guard is needed.
- [~] Auth handlers' hand-built `Set-Cookie` Responses — **left as-is** (audit said "acceptable"; a json.ts
  extra-headers helper for 3 call sites is more indirection than it saves; the cookie-setting is self-evidently why).
- [~] R2-unset message string variance — **left** (intentionally differentiated per feature; not worth flattening).

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
- [x] ✅ **DONE 2026-06-26 (migration 0090, with P2-2).** `events`/`tasks`/`home_projects` used
  `recur_json {freq,interval,weekdays}`; `schedule_blocks` used separate `weekdays`+`week_interval` columns +
  a parallel `weekActive` copy of the fortnight math. **Converged:** folded `weekdays`+`week_interval` into a
  single weekly `recur_json` (byte-identical to events) + kept `anchor_day` as the recur anchor; **deleted
  carResolve's `weekActive`** — the resolver now drives off `_lib/recur.occurrenceOn` (one engine for every
  recurring entity). Extracted the **shared `parseScheduleBlockRow`** (killed 4 hand-rolled row→ScheduleBlock
  copies + a latent `this-week.ts` raw-cast bug). **API contract preserved:** `/api/schedule` still speaks
  `weekdays`/`weekInterval`/`anchorDay` (the handler parses ⇄ builds `recur_json`), so the `/voiture` editor is
  untouched — zero frontend churn. Rewrote the carResolve test (the old fixtures cheated by passing a `weekday`
  separate from `dayStart`; recurrence now derives the weekday from the day, so the tests use genuine Wed/Thu/Sun
  dates). typecheck + 799 tests + build green.
  > The original deferral ("behavioural rewrite, real regression surface") was right that it's non-trivial — done
  > carefully as its own gated commit with the engine test rewritten and the API contract held byte-stable.

### DB-5 🟡 Member-attribution fragmentation
- [x] ✅ **DONE 2026-06-26 — documented (no column renames, as instructed).** The "who" rule is written into
  `CLAUDE.md` ▸ Schema conventions ▸ Attribution: the three coexisting patterns (soft member ref · explicit
  `author_member_id` beside a scope ref · external `author_label`/`sender_name`), "pick by who's writing, don't
  unify," and the flagged confusion (`member_id` = *subject/scope* on notes/family_notes vs *author* elsewhere → new
  soft refs get a one-line comment naming the intent). Existing columns left as-is. Pairs with P2-8 above.

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
- [~] **NO CHURN 2026-06-26 (convention-only, as the audit itself flagged).** The flat-vs-nested key mix across ~30
  domains is cosmetic — `i18n.ts`'s `typeof FR` parity contract already makes EN structurally mirror FR or `tsc`
  fails, so the "structure" can't silently drift regardless of nesting style. Forward rule (recorded here, not worth a
  churn pass): **nest** when a domain has a cluster of related sub-keys (`recipes.fridge.*`), keep **flat** for a
  handful of top-level strings. No code change.
- ✅ No meaningful hard-coded user-facing strings found — `useT()` adoption is essentially complete.

### <a id="struct-1"></a>STRUCT-1 🟡 Two full-screen-scene patterns + one outlier
- **`FormScene`** (create flows, injects member roster): EventFormPage, ChoreFormPage, HomeProjectFormPage,
  RoutineFormPage. **`SceneHead` + manual `<div class="scene">`** (15+ standalone/edit scenes). Both fine, but
  the split is undocumented and `RecipeFormPage` is a third, hand-rolled-modal outlier.
- [~] `RecipeFormPage` `<h2>` → **N/A (confirmed with FE-2).** `RecipeFormPage` is a thin route wrapper with no `<h2>`
  of its own; the header lives inside `RecipeForm`'s `.recipe-modal__bar` (a full-screen scene, per the FE-2 re-scope),
  so there's nothing to migrate here.
- [x] ✅ **Documented 2026-06-26.** Wrote the **FormScene vs SceneHead vs manual-scene** decision into `COMPONENTS.md`
  (the `FormScene` row): use `FormScene` for operator create-forms needing the roster + auth bounce; use a manual
  `.scene` + `SceneHead` + `.scene__body` (with `useSceneClose`/`useEscapeKey`) for any other full-screen route. The
  **`EditScene` sibling is deferred as over-abstraction** — the ~5-line shell already reuses `SceneHead`/`useSceneClose`
  and varies per page (header actions, body class, whether `close` is needed in the body), so a wrapper fitting all
  ~15 sites would be prop-heavy for a tiny saving. Revisit only if the pattern stabilises. No code change.

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
- [x] ✅ **DONE 2026-06-26 — but RE-SCOPED after reading the four pilots.** The audit's monolithic
  `useItemList`/`<ItemList>` across all ~9 lists is **over-merge** (the primary action — check-and-add-to-list /
  toggle-in-place / open-a-plan-picker — and the markup genuinely differ per list; two of four don't even own
  their query). What the evidence showed: **`MealIdeas` and `Leftovers` are ~85% copy-pasted** (same
  `kitchen__idea` markup, EntityCombobox add, `useDeferredRemoval` delete+undo, `useInlineEdit`+EditField rename,
  `useSingleOpen`+MealPlanPicker). Extracted that twin into **`<MealPool>`** (`components/kitchen/MealPool.tsx`,
  generic over row + combobox entity); both are now ~70-line wrappers injecting only `endpoint`/`buildAddBody`/
  `onPlan`(reusable vs consumed+compensating-undo)/`renderLead`/`options`/`labels`. ~170 LOC of duplication gone,
  the two pools can't drift. Registered in DevKit + COMPONENTS.md. typecheck + 799 tests + build green.
- **Kept per-list (NOT over-merged):** PantryTab (check→add-to-list, CheckRow), TodoSection (toggle-in-place,
  cross-scope sync), réserve — different primary actions / markup. The genuinely-universal seam they DO share is
  just the `useDeferredRemoval` delete-with-undo wiring, which is already a shared hook; a thin `useListRemoval`
  wrapper over it is a possible small follow-up, not a monolith.
- **Calm:** unifies chrome + undo across the two pools; adds no counts/badges. Did NOT merge the *tables*.

### <a id="p2-1"></a>P2-1 🟡 (high value / low risk) `createDeviceStore` — the per-device setting factory
~10 localStorage stores (`ambient`, `boardCards`, `apod`, `canvas`, `cookPrefs`, `measurePrefs`, keep-awake,
per-behaviour ambient opt-outs, …) each hand-roll the identical `useSyncExternalStore` shape: interface →
defaults → KEY → listener Set → cache → read/snapshot/subscribe → `useXxx` hook (~58 LOC each, e.g. `lib/ambient.ts`).
- [x] ✅ **DONE.** `lib/createDeviceStore.ts` — `createDeviceStore<T>(key, defaults, {read?, write?})` → `{ get, use,
  set, reset }`, pluggable `read`/`write` so each store keeps its EXACT localStorage encoding (no user-pref reset).
  Migrated all 8 device stores: scalar flags `apod`/`canvas`/`keepAwake` ('0'/'1'), `ocrPref` + `cookPrefs` density
  ('device'/'cloud', enum) + `cookPrefs` step-ings ('on'/'off'), and the object stores `ambient` (JSON+clamp) /
  `boardCards` (JSON+reconcile) via thin partial-merge `setX(patch)` wrappers. Call-site names unchanged; ~30–60 LOC
  of subscribe/cache/useSyncExternalStore boilerplate per store collapsed to ~3 lines. typecheck + 797 tests + build.
- [~] `toggleField(name)` helper — **skipped (YAGNI):** every call site sets an explicit value from a control
  (`setApodEnabled(checked)`, `setCookDensity('large')`), not a toggle; `store.set(!store.get())` covers the rare case.

### P2-5 🟡 (med value / med risk) `useHouseholdListSetting` — the household-JSON setting concept
8 settings live in `households.*` JSON columns and split across **three** write patterns (React-Query+useMutation;
useState+useWrite+undo; useState+`api()`+invalidate): `recipeTags`, `recipePills`, `meals` (slot colours/hidden),
`aisles`, `cars`, `reserve`, household name, household pets. Each re-implements GET→merge→PATCH + a list editor.
- [x] ✅ **DONE 2026-06-26 — cars/reserve pilot, the rest left distinct (verified over-merge otherwise).**
  Extracted **`useHouseholdListSetting(field, seed, clearedMsg)`** (`lib/householdListSetting.ts`: mount-once
  `api('household')` read + seed, whole-array PATCH via `useWrite`, optimistic rename/recolour/add, undoable delete)
  + the shared **`<HouseholdListSection>`** render (the identical `meal-slots` coloured-legend + ColorPicker +
  EditField + OperatorSection). `cars.tsx` + `reserve.tsx` (previously byte-for-byte copies) are now ~20-line
  wrappers passing `field`/`seed`/`labels`. Registered in DevKit + COMPONENTS.md. typecheck + 799 tests + build green.
  > **Re-scoped from "8 settings":** on inspection only **cars/reserve** are true twins. The other 6 are legitimately
  > divergent and folding them would be over-merge: `recipeTags`/`recipePills` hit a *different* endpoint
  > (`/api/recipe-tags`) via `useMutation` with no undo; `meals` is per-slot toggles (no add/remove) via `api()`;
  > `aisles` is reorder-only; household **name** is a single field (not a list); and **pets** aren't a JSON column at
  > all (separate `pets` table — audit premise wrong). The duplicated `useColorOverride` the audit named **doesn't
  > exist** (each setting's read hook does its own `override[id] ?? default` lookup — not worth a shared helper).
- ⚠️ Doesn't fix the known last-write-wins across two operator tabs (carried, not introduced; one-operator stands).
- [~] **DB-6 `household_preferences` split — DEFERRED (not bundled).** The roadmap suggested bundling it here, but
  the hook reads/writes via `/api/household`, so it's **indifferent to where the columns physically live** — DB-6
  buys nothing for it. DB-6 itself means churning ~15 pref columns + every SQL reader in `household.ts` (GET builds
  one object from all of them) for a *modest* tenancy-vs-prefs separation. Not worth the reader-churn now; the audit
  itself says "skip if you're not touching settings anyway." Revisit only if `households` genuinely needs the split.

---

## B. Registries / shapes that drifted

### <a id="p2-2"></a>P2-2 🟡 (high value / low risk) `<BoardCard>` shell + `DerivedOccurrence` shape
Two related drifts:
- **Card shell:** `ARegler`, `AutoCard`, `CarnetsCard`, season card, `CercleBirthdays`, etc. each hand-roll the
  same `<div class="card">` + `.sec-label` header + empty-hide. `useBoardCards` already generalizes *layout*; the
  *card contract* isn't. → [x] ✅ **DONE 2026-06-26 (card-shell half).** Extracted **`<SecLabel>`** (the ONE
  `.sec-label` header: glyph disc — `icon` Phosphor OR `iconNode` emoji — + label + rule + optional `count` +
  help-mode-aware title) and **`<BoardCard>`** (the standalone shell: `SecLabel` + content, `to` → `<Link>` else
  `<div>`, caller keeps its `className`/`style`) in `components/board/BoardCard.tsx`. Adopted in `AutoCard`,
  `CarnetsCard`, `SeasonUpkeepCard`; `Section` (Act.tsx) now renders `<SecLabel>` too, so the header can't drift.
  Registered in DevKit + COMPONENTS.md. typecheck + 797 tests + build green.
  > **Audit premise corrected:** there is **no single `<div class="card">`** shared across these — the wrappers are
  > deliberately distinct CSS (`auto-card` full-width strip, `carnets-card`, `bento` grid), so only the *header* +
  > shell are shared, not one card class. **`ARegler` is NOT a sec-label card** — its `card` variant is a hero-tile
  > (`.now-card--regler` with `.blob`/`.label`/`.what`/`.icn`, matching the supper/weather heroes), so it's left
  > out by design. `CercleBirthdays` is not a component (birthdays surface through the event system). Empty-hide
  > stays at each call site (the rules differ and read clearer inline). *(DerivedOccurrence half still open — below.)*
- **Derived shape:** `birthdayOccurrences()`, `carResolve.workOccurrencesInRange()`, `carnetLife` all produce
  "a date + label + metadata" in **different** shapes, re-wrapped per consumer. → [x] ✅ **DONE 2026-06-26.**
  Introduced **`DerivedOccurrence { id; at }`** (`functions/_lib/derived.ts`); all three emitters now extend it.
  Concrete wins: **carnet gained a stable `id`** (`carnet-life:<carnetId>`) — it was the only derived signal
  lacking one — and `workOccurrencesInRange`'s `startAt`→**`at`** so the three are uniform on the two universal
  fields (stable id + primary instant). Updated the 3 backend consumers (board/month/this-week) + the frontend
  `CarnetSoon` mirror; added a carnet-id test. typecheck + 798 tests + build green.
  > **Audit shape corrected — no `kind`/`source` field.** The proposed `{…, kind}` discriminator **collides**:
  > `CarnetLifeSoon.kind` already means the carnet's TYPE (home/auto/appliance). Rather than rename that or add a
  > dead colliding field, the **`id` PREFIX is the discriminator** (`birthday:`/`work:`/`carnet-life:`) — route a
  > mixed list with `id.split(':')[0]`. `label`/`name`/extras stay per-kind (the consumers re-wrap to their own
  > `Ev`/event shapes regardless, and a cross-boundary `name`→`label` rename — `guest/window`, frontend `CarnetsCard`
  > — was high-churn/low-value), so the base names only `{id, at}`: what's truly common.

### <a id="p2-4"></a>P2-4 🟡 (med value / med risk) `staged_media` — unify the guest submission media pipeline
`intake_submissions`+`intake_media` and `postbox_submissions`+`postbox_media` implement an **identical**
quarantine→stage→review→materialize→7-day-orphan-sweep pipeline; the two `*_media` tables and their cleanup
queries are isomorphic (~50 LOC dup).
- [x] ✅ **DONE 2026-06-26 (migration 0091).** Verified the two tables were **byte-for-byte isomorphic** (same 6
  columns; only `intake_media` carried an index) and the write/sweep/resolve-delete identical bar the table name.
  Merged into one **`staged_media(…, submission_kind)`** (backfilled from both, dropped the originals) +
  `functions/_lib/stagedMedia.ts` with `insertStagedMedia` / `sweepAbandonedStagedMedia` / `deleteStagedMediaByKeys`,
  now called by both `/api/intake` + `/api/postbox` (and the two guest writers). ~50 LOC of dup gone; the unified
  index covers the sweep for both kinds. typecheck + 799 tests + build green.
- **Kept separate (as planned):** the two *submission* tables + review UIs (`IntakeReview` structured-payload merge
  vs `PostboxReview` flat accept) — their payloads genuinely differ; the sweep's `referenced`-key set is built per
  -kind in each handler (the one part that isn't shared) and passed into the helper.

### P2-6 🟡 (med value / med risk) `things.ts` — one "given a thing, pick its colour/icon/emoji" registry
Resolution is mostly centralized (`pictoFor` 350-entry grocery table, `aisleFor` reusing it, `CATS` category
tints, carnet `KIND_EMOJI`, `PIN_EMOJI`) — **but fallbacks are scattered and drift**: pet default `#C7873F`
hardcoded in `SearchPage`, business/work/recipe-tag colours each have their own fallback in different files. A
palette change means hunting multiple files.
- [x] ✅ **Registry created (`lib/things.ts`).** `THING_DEFAULTS: Record<ThingKind, {colour}>` + `colourFor(kind,
  explicit?)`, seeded for all kinds (member/pet/chore/project/routine/business/group/car/note). **Adopted fully for
  the worst drift — the pet amber `#C7873F`**, which was copy-pasted across 6 files (detail/adapters, SearchPage,
  IntakeReview, household, + two local `PET_COLOUR` consts in PetForm/FamilyBuilder, with comments aspiring to a
  `PET_ACCENT` that never existed) → now one source. `pictoFor`/`CATS` left as-is (richer domain resolvers).
- [x] ✅ **Follow-up DONE 2026-06-26.** Migrated **16 zero-visual-change sites** to `colourFor(kind, …)` across 13
  files: routine `#88a36f` (KidView, RoutinePlayer), chore `#88a36f` (ChoreLedger, ChoreForm, chores, ThisWeek),
  project `#88a36f` (HomeProjectForm, homeProjects, ThisWeek), car `#6b7a8f` (VoiturePage ×2, AutoCard), group
  `#2a8f85` (ContactForm, cercle), note `#fbd66b` (Notes). Each literal **exactly matched** its registered kind
  default, so zero pixels moved. typecheck + 799 tests + build green.
  > **Left (would NOT be zero-change):** the `?? '#888'` member-avatar fallbacks (VoiturePage:314, AutoCard:143,
  > schedule.tsx:101) — the registry's `member` default is `#7a8b6f` (the backend seed), so migrating would shift
  > a neutral grey to sage-grey: a real visual change, not a mechanical swap. The `#888888` neutral discs in
  > `HouseholdListSection` aren't a kind default. And `adapters.ts`'s two `#2A8F85` accents are the cercle *person*
  > accent — no clean registered kind (member is sage-grey, not teal). These need a decision, not a sweep.

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
  composer via `endpoint`/`affectedKey`/`extraBody`. → [x] ✅ **DONE 2026-06-26 — documented in `CLAUDE.md` ▸ Schema
  conventions ▸ Media attachment.** Wrote the **memo media lifecycle** (uploadMedia → `{key}` → `media_key`+`media_kind`,
  the **`media_key` iff `media_kind` invariant**, replace/clear **frees the R2 blob**, R2-unset hides) onto the
  existing media-trio bullet. Chose docs over a `_lib/memoMedia.ts` stub: the code is already shared (`MemoControls`),
  only the rule was unwritten. No table merge. *(The optional `media_key`-iff-`media_kind` test left as a future
  guard — it edges into the "don't extract code" line the audit drew for P2-8.)*
- **Attribution ("who"):** member soft-ref vs `author_member_id` vs external `author_label`/`sender_name` are each
  right for their context (postbox's name→member tint-on-exact-match is the model for future guest→household flows).
  → [x] ✅ **DONE 2026-06-26 (with DB-5) — documented in `CLAUDE.md` ▸ Schema conventions ▸ Attribution.** Enumerated
  the **three "who" patterns** (existing-member soft ref · explicit `author_member_id` beside a scope ref · external
  `author_label`/`sender_name` for a non-member, with postbox name→tint-on-exact-match as the guest→household model)
  and the rule "pick by who's writing, don't unify them." Code unchanged.

### <a id="p2-9"></a>P2-9 🟡 (med value / low risk) Help/explainer: kill the orphan-bug class + curb drift
The guide/help **system** is already excellent — `GUIDE`/`CONCEPT_THEMES`/`FEATURE_MAP_TILES` is one taxonomy that
tours (`guideWhat`), `SectionIntro`, and `FeatureMap` all reuse. Two real gaps remain:
- [x] ✅ **Orphan check DONE.** `useHelpMode<K extends string>(content: Record<K, HelpEntry>, …)` is now generic over
  its registry keys, and all 7 help registries (`ADD_HELP`/`CERCLE_HELP`/`BOARD_HELP`/`KITCHEN_TAB_HELP`/`LISTE_HELP`/
  `OPERATOR_HELP`/`ROUTINES_HELP`) use `satisfies Record<string, HelpEntry>` so `keyof` is the literal union. An
  unregistered key in `pick`/`bubbleFor`/`HelpTitle k=` now **fails `tsc`** (verified via `@ts-expect-error`), killing
  the "? target renders nothing" orphan class at the surface level. `HelpMode<K = string>` uses **method-syntax** so a
  narrow `HelpMode<keys>` stays assignable to a child's loose `help?: HelpMode` prop — threading unaffected, zero churn
  at the ~20 thread sites. (`data-tour` anchors are still untyped strings — a separate, smaller follow-up.)
- [ ] **Drift:** `ADD_HELP`/`CERCLE_HELP` carry their **own** one-liners separate from `GUIDE.what`, so they can
  diverge. Low priority: have help bubbles pull the summary from the guide entry (like tours already do via
  `guideWhat`). The big "one FeatureExplainer registry feeding guide+help+tour+intro" is **deferred** — high churn,
  the copy already exists; only worth it at the next onboarding refresh.
- [ ] **Adoption template:** only AddSheet + Cercle wire help-mode; Board/Kitchen/Routines/Liste haven't. Add a short
  "how to add section help" scaffold doc so adoption is uniform (no new registry shape needed).

### P2-10 🟢 Add-system: capture spine is well-generalized; two small folds
The ＋ capture spine (`SECTION_MODES`/`NAV_TARGET`/`MODE_DRESS`/`FORM_ROUTES`, one `<AddSheet>` mounted in
`HubLayout`, `/share` + `QuickAddPage` as companions on the same endpoints) is a **model generalization**. Minor:
- [x] ✅ **DONE 2026-06-26.** Folded the hard-coded 5-tile kitchen-week grid in AddSheet into a declarative
  `KITCHEN_ACTIONS` catalog (module-level, sibling to the existing `MODE_DRESS`/`CHORE_KINDS` dress catalogs): each
  entry is `{ key, icon, iconColour, wash, label(t), show(flags,help,ai), disabled?, title? }` and the render is a
  `.filter(show).map(...)`. ~75 lines of repetitive JSX → ~16. The AI tile's special-casing (gated on `aiEnabled`, +
  `disabled`/`title`) encodes as the optional `disabled`/`title` fns — behaviour byte-identical. **Bonus:** the
  duplicate `actionLabel` help-title map is now *derived* from the catalog, which also **fixes a latent orphan** —
  `emptyFridge` was missing from `actionLabel`, so its help bubble fell through to `modeLabel`; it now gets its real
  title. typecheck + e2e (shop-the-week) + build green. (Left in AddSheet rather than `lib/addSheet`: the catalog
  carries view deps — `IconName`, colours, `t`-labels — that belong with the render, beside the other dress catalogs.)
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
- [~] **`attachmentsFor(kind,id)` / `deleteAttachments(kind,id)` helper** — **SKIPPED after verification: the
  "real orphan-blob leaks" premise is false.** Audited *every* R2-blob path (recipes step-images + original-source,
  care_log media_json, drawings media+scene, routines card narration+photo arrays, notes/family_notes media+scene,
  pets/contacts/businesses/contact_photos/carnets/home_pins media_key, photos prune+delete) — **all already free
  correctly** on both replace-PATCH and DELETE. So this is pure dedup of ~13 currently-correct, co-located,
  idiomatic free-paths; a kind-registry would ADD indirection (you'd have to consult the registry to know what a
  delete frees) and risks breaking a working path. Not worth the churn at one household. *(Optional tiny win left
  on the table: a variadic `deleteR2Blobs(bucket, ...keys)` to fold the `media_key`+`scene_key` pairs — marginal.)*

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
11. **DB-4** converge `schedule_blocks` recurrence onto `recur_json` — ✅ **DONE 2026-06-26 (migration 0090)** with P2-2: `weekdays`+`week_interval` → one weekly `recur_json`, carResolve drives off `_lib/recur` (deleted `weekActive`), shared `parseScheduleBlockRow`, API contract held byte-stable.
12. **DB-7** small items (idempotency `status` comment, `carnets.archived_at` align) while in the migrations.

### Phase 3 — Behavioural extractions (the real generalization payoff, on the now-clean schema)
13. **P2-1** `createDeviceStore` factory (isolated; do first here).
14. **P2-2** `<BoardCard>` + `DerivedOccurrence` (reads cleaner after DB-4).
15. ~~**D.2** `attachmentsFor`/`deleteAttachments` helper~~ — **SKIPPED**: verified no orphan-blob leaks exist (all 13 paths already free correctly); pure-dedup churn not worth the indirection/risk. See D.2 above.
16. **P2-3** `useItemList` behavioural hook (after DB renames so it targets final columns).
17. **P2-5** `useHouseholdListSetting` — ✅ **DONE 2026-06-26** (cars/reserve pilot via `lib/householdListSetting.ts` + `<HouseholdListSection>`; other 6 settings verified divergent, `useColorOverride` doesn't exist). **DB-6 NOT bundled** — the hook is endpoint-based so it's indifferent to the column home; DB-6's ~15-column reader-churn isn't worth a modest tenancy split now (deferred).
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
