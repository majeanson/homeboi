# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: a separate `CLAUDE.md` one level up documents the broader LAC ecosystem.
> This file governs **Babillard** (the `PlannerOrSomething/` project) specifically.

> **Asked "what should we work on?" — read [`STATE.md`](./STATE.md) first, not the
> ledgers.** It is the one front door: current health numbers, which of the thirteen
> markdown files still hold work and which are finished, and the whole remaining backlog
> consolidated and ranked by user harm rather than by which document it lives in. It also
> records the two counting traps that have burned a session each: `PARITY.md` and
> `ACTIONS.md`'s unticked boxes are **per-feature checklist templates, not work**, and a
> ledger entry is a verdict from a moment — **grep the claim in code before building on
> it** (a third of the items picked up on 2026-08-27 were already done).
>
> This file (`CLAUDE.md`) stays the **law**: how to write code here. `STATE.md` is *what
> to write next*. Update `STATE.md` in the same commit as the work it describes.

---

## What this is

**Babillard** — a calm household command-center for a cheap always-on wall tablet:
today's agenda, shared lists, chore rotation, "supper tonight," kid routines, a
kitchen/recipe planner. Built **useful-at-home first, calm by design**: no streaks,
no points, no push notifications, finite lists that empty and stay empty.

Single-page React app + one Cloudflare Worker (static assets + `/api/*`) + D1 +
Workers AI + R2. UI copy is **bilingual, FR-CA (Québécois) first**.

The product thinking lives in [`bmad/`](./bmad/): brief, PRD, architecture. Many
code comments cite requirement tags from there (`NFR-CALM-1`, `PRD C5`, `OD-1`, …).

---

## Build by reuse — read before you write (START HERE)

**This codebase is mature. Almost nothing you'll be asked for is greenfield.** There
is already a shared component, a lib helper, a CSS class family, or a section pattern
for it. The recurring failure mode here is building something new beside an existing
thing and then having to refactor it back onto what we already have. **Default to
reuse and refactor; treat "create a new component / class / endpoint" as the
exception you justify, not the starting point.**

Before implementing ANY change, do this first — it's faster than the rework it saves:

1. **Read how the section already works.** Open the page/section you're touching and
   the components it renders. Match its existing structure, naming, and idioms rather
   than inventing a parallel one. The hub tabs are `src/pages/{Board,Kitchen,Liste,
   Notes,Maison,Operator}.tsx` (Operator = Réglages); settings bodies live in
   `src/components/operator/*`; kitchen sub-tabs in `src/components/kitchen/*`; the
   Maison sections in `src/components/{maison,cercle}/*`. Grep the feature name first.
2. **Look for the primitive that already exists.** Check **`COMPONENTS.md`** (the
   living inventory + uniformization backlog) and open **`/dev/kit`**
   (`src/pages/DevKit.tsx`, reachable from Réglages ▸ Système ▸ Affichage) — it renders
   every shared component live across theme/surface/audience/locale. If a primitive fits,
   use it; if it _almost_ fits, **extend the primitive**, don't fork a copy.
3. **Check the lib helper / convention** that governs the behaviour (table below).
   Cross-cutting behaviour (writes, query keys, surface/audience, detail peek, calm,
   realtime, undo, voice) is centralized on purpose — wiring it by hand silently
   bypasses offline, CSRF, attribution, or a calm guarantee.
4. **Reuse the CSS class family**, don't add a one-off. `styles/*.css` already has
   `.btn`, `.input`, `.chip`/`.tag`, `.card`/`.surface`, `.sheet__*`/`.scene__*`,
   `.listrow`, `.row-actions__*`, `.edit-field__*`, etc. (`@import` order **is** the
   cascade — append only, never reorder).

### Reach for these BEFORE hand-rolling

| Need | Use (not a new one) | Where |
| --- | --- | --- |
| Type/edit text + clear/mic/actions | **`EditField`** | `components/EditField.tsx` |
| "Search + pick an existing thing + free-text" | **`EntityCombobox`** | `components/EntityCombobox.tsx` (options in `kitchen/comboOptions.tsx`) |
| An activity / list row (check / nav / info) | **`Act`** + `Section` | `components/board/Act.tsx` |
| Generic checklist row | **`CheckRow`** / **`ListRow`** | `components/CheckRow.tsx`, `components/ListRow.tsx` |
| Edit/delete icon pair on a row | **`RowActions`** | `components/RowActions.tsx` |
| "Tap an item → detail peek" | **`useEntityDetail()`** + adapters | `components/detail/*`, `lib/detail.ts` |
| Empty / status / chip / section header | **`EmptyState`/`StatusMessage`/`Chip`+`ChipGroup`/`SectionHeader`** | same-named files in `components/` |
| Collapse a secondary group (calm) | **`Disclosure`** / `useSingleOpen` | `components/Disclosure.tsx` |
| In-page segmented sub-tabs ("one job at a time") | **`SubTabs`** (the `.subtabs` family) | `components/SubTabs.tsx` (help-mode aware; used by La cuisine + Maison) |
| A horizontal row of buttons / chips / controls | **`Cluster`** (wraps) / **`Rail`** (scrolls one line) — never a hand-rolled flex row | `components/Layout.tsx` (`.cluster`/`.rail` in `core.css`; see [Horizontal overflow](#horizontal-overflow)) |
| A row that scrolls sideways with a hidden scrollbar | **`useHScroll()`** — maps the mouse wheel onto it, reports `overflowing`/`atStart`/`atEnd` | `lib/hscroll.ts` (`Rail`/`SubTabs` wire it already; see [Horizontal overflow](#horizontal-overflow)) |
| A dialog / bottom sheet | **`Modal`** + `useModal` / `useSwipeToDismiss` | `components/Modal.tsx`, `lib/useModal.ts` |
| A Réglages section wrapper | **`OperatorSection`** | `components/operator/OperatorSection.tsx` |
| Hub-tab / scene header | **`HubHead`** / **`SceneHead`** | `components/HubHead.tsx`, `components/SceneHead.tsx` |
| "Everything the app does" themed map / feature discovery | **`FeatureMap`** (the ONE taxonomy: `CONCEPT_THEMES`/`FEATURE_MAP_TILES` in `lib/guideContent`) | `components/FeatureMap.tsx` (reused by the Guide jump-grid, the Board `WelcomeCard`, DevKit — extend the taxonomy, don't fork a list) |
| Person photo/initial, mic, icon, image | **`Avatar`/`VoiceButton`/`Icon`/`ZoomableImg`** | `components/*` (pass a family/group `colour` so a photo-less member's initials disc takes the group colour) |
| Pick a household face (Maisonnée + members) | **`MemberSwitcher`** (the `.mswitch` "Aujourd'hui" row) | `components/MemberSwitcher.tsx` (controlled; every "who am I today" **lens** — board « Aujourd'hui », Maison's focus lens + the Notes face — wires it to the ONE device profile `useProfile`, so the pick is remembered app-wide. Only a **value** picker (a mot's recipient, a habit's owner) holds local state) |
| Confirm a destructive delete / undo a light one | **`useConfirm`** / the undo toast | `lib/confirm.tsx`, `lib/toast.tsx` (`lib/undoStack.ts`) |
| Touch drag-and-drop / reorder | **`usePointerDnd`** | `lib/dnd.tsx` (never HTML5 `draggable`) |
| A press-and-hold gesture | **`useLongPress`** | `lib/useLongPress.ts` (aborts on travel, kills the context menu, swallows the trailing click) |
| "Something is happening — don't screensaver/drift over it" | **`pokeIdle()`** | `lib/idleHold.ts` — HubLayout's idle cycle only sees `pointerdown`/`keydown` at `window`; anything else that counts as activity (a hands-free voice capture, a gesture that `stopPropagation()`s on purpose) pokes this instead |
| A board card's placement / width / drop target | **`WidgetGrid`** + **`CardSlot`** | `components/board/*` — one grid per zone (`band`, `grid`); sizes/zones/modes live in `lib/boardCards`. Never re-add `columns:` or `column-span` to the board |
| "This card has nothing to show" | **`useReportEmpty`** | `lib/useReportEmpty.ts` — never a bare `return null`: the slot can't tell empty from loading, and mode `always` needs to know |
| Upload a photo / audio / drawing blob to R2 | **`uploadMedia()`** / **`useMediaUpload()`** | `lib/uploadMedia.ts` (resize→POST→`{key}`, 503→`MediaUnavailableError`) |

### Cross-cutting conventions a new feature MUST respect

| Concern | Use | Don't |
| --- | --- | --- |
| Any `/api/*` write | **`useWrite()`** (`lib/write.ts`) — a **test** enforces this now (`src/lib/write-rule.test.ts`): a raw `api()` write fails the build unless its site is in that file’s ALLOWED list **with the reason**. The prose rule had drifted, and one of the strays lost data (`/share` had no outbox) | …call `api()` directly for writes (skips the offline outbox), or add an ALLOWED entry without saying why the outbox would be actively WRONG there |
| Any `/api/*` read/fetch | **`api()`** (`lib/api.ts`) | …`fetch` directly (loses CSRF, device token, locale, profile) |
| Server state / caching | **TanStack Query**; shared keys in `lib/queryKeys.ts` | …a parallel store, or a key spelled twice |
| Device role / presentation lens | **`useSurface()`** / **`useAudience()`** | …branch on width or invent a flag |
| Calm guarantees | structural ones are non-negotiable (a **test** enforces no streak/points/badge/push/inventory) | …add counts, ranks, streaks, points, push, or a quantity column |
| Backend endpoint | handler under `functions/api/` **+** `authed()` wrapper **+** a `TABLE` row in `worker/routes.ts` | …hand-roll the auth guard, or forget the route table |
| Delete / clear a row from a **live-polled** list | **`useDeferredRemoval(queryKey)`** (`lib/useDeferredRemoval.ts`) — `visible()` filters the rows, `remove()` holds the write behind the undo toast + awaits a refetch | …optimistically `setQueryData` then defer the write: the next poll resurrects the row mid-undo (flash-back glitch) |
| A full-screen surface where the user **types** | be a **`.scene`** (`FormScene`/`SceneHead`) — or add **`.vv-fit`** on the fixed shell + **`.vv-slack`** on its scroller. Fit + trailing slack live in ONE place (`core.css` « Keyboard fit »); the caret pin/follow is global (`lib/viewportVars.ts`), nothing to wire per field. On-device debug: Réglages ▸ Système ▸ Version → « diagnostic clavier » | …shrink the shell under `.kb-open` (`height: var(--vvh)` — the page behind shows through the keyboard strip) or skip the slack (a last-line caret has no room to rise). `src/styles/keyboard-fit.test.ts` fails the build on both |
| A container that already holds buttons | **plain `<div onClick>`** (mouse convenience only) | …give it `role="button"`+`tabIndex`: a control inside a control announces as "a button whose contents are buttons", and `stopPropagation` on the inner handlers fixes the MOUSE while hiding the semantics. Same for `role="img"` on an SVG with interactive children — an `img` role makes its whole subtree presentational, so those children vanish from the a11y tree (use `role="group"`). `src/lib/nested-interactive.test.ts` fails the build on both |
| Hide a control from a read-only guest | **`isGuest()` — but only if it writes `/api/*`** | …gate a **device-local** pref with it (theme, language, audience lens, voice, calm, `lib/boardCards` layout): they're localStorage, they change nothing for the household, and gating them is what hid board reordering + the whole in-app guide from the public demo. See [The demo is a guest link](#the-demo-is-a-guest-link) |

**When you DO add a new shared component:** register it in `src/pages/DevKit.tsx`,
add it to `COMPONENTS.md`, and (if user-facing) document it in the in-app Guide
(`lib/guideContent.ts`). A new primitive that isn't in the gallery is invisible to
the next session and will get re-invented.

**When a feature needs explaining (guide card/point, "?" help hint, tour step,
Réglages deep-link):** read **`DISCOVERY.md`** first — it maps the whole
comprehension ↔ action system (guide taxonomy, help registries, the
`?tab/sub/lens/card/point/focus/plus` URL grammar, the alias drill) and carries
the add-a-feature checklist. Merge into an existing card before creating one.

**Feature-parity audit:** **`PARITY.md`** is the standing playbook that scores
every feature against every cross-cutting dimension (peek, undo, offline, search,
help, toddler lens, e2e…) and carries the canonical **new-entity checklist** —
consult it when adding an entity or asked about feature gaps/uniformity. **Any new
feature walks the Part 5 checklist and passes the Part 6 gold-standard gate before
it ships** (score its Part-1 row gap-free — every cell ✅ or a footnoted ➖, no bare
🔶/❌ — reuse the primitive per dimension, and cite the migration/commit for
non-obvious cells; paste Part 6's "Definition of Done" into the commit). A matrix
cell is a **verdict, not a fact** — re-verify it against code before relying on it,
and flip a cell in the same commit that resolves it.

**Action reachability:** **`ACTIONS.md`** is the door matrix — every user action ×
every entry point (row furniture, ⋯ menus, gestures, peek actions, ＋ sheet tiles,
Réglages mirrors, the ⚙ Simple↔Avancé faces), with the undo tier and the non-touch
verdict per row. **When adding or moving ANY user action, pick its doors from that
file's Part 1 taxonomy and walk its Part 5 checklist** — never invent a new entry
channel or a fifth spelling of delete. PARITY's D17 points at it.

---

## Commands

```bash
npm run dev            # Vite frontend-only, HMR on :5173, /api proxied to :8787
npm run cf:dev         # full stack: wrangler dev on :8787 (SPA + Worker + local D1)
npm run build          # tsc -b (typechecks SPA + Worker + Functions) then vite build → dist/
npm run typecheck      # tsc -b --noEmit
npm test               # vitest run (pure-logic unit tests)
npm run test:watch     # vitest watch
npm run e2e            # Playwright (boots its own Vite, stubs every /api/* — no D1/secrets)
npm run e2e:sw         # SW offline-shell e2e ONLY (own harness: vite build + preview the PROD
                       #   bundle, since the service worker registers only in a PROD build).
                       #   sw.spec.ts is testIgnore'd from the default `npm run e2e`.
npm run e2e:matrix     # ON-DEMAND visual state sweep (e2e/state-matrix.spec.ts, own harness):
                       #   route × opened state × theme × lens × fake keyboard → screenshots +
                       #   structural assertions + screenshots/matrix/manifest.json, built for a
                       #   Claude review pass (read the manifest, open flagged PNGs). Never runs
                       #   per-push; CI twin = Actions ▸ "State matrix" (dispatch + WEEKLY,
                       #   Mondays — the contentTopPx ratchet needs something to pull it).
npm run deploy         # build + wrangler deploy → https://babillard.<account>.workers.dev
```

Run one test file or one test by name:

```bash
npx vitest run functions/_lib/whenparse.test.ts
npx vitest run -t "calm tenets"
```

Database (local needs the schema applied before `cf:dev`):

```bash
npm run db:migrate:local   # apply migrations to local D1, then sync the sqlite file
npm run db:migrate:prod    # apply to remote D1 (CI does this before deploy)
```

CI (`.github/workflows/ci.yml`) runs typecheck → test → build on every push, which
**gates** `db:migrate:prod` + deploy on `main`. E2E (`.github/workflows/e2e.yml`) is
**decoupled**: it **chains off** the CI & Deploy workflow (`workflow_run`) and only runs
once CI concluded successfully on `main` — so it gives signal *after* a green merge but
never blocks the deploy (main ships as soon as typecheck/test/build are green). The E2E
job runs `npm run e2e` then `npm run e2e:sw` (the SW harness). **Trust CI as the baseline;
don't run e2e locally by default — check the E2E job on the run page for visual/flow
regressions.** Node 24.

> **Workflow: push straight to `main`.** No PR branches — commit and `git push origin
main` directly. CI (typecheck/test/build) is the only gate; a red build is caught
> on `main` and fixed forward. (This supersedes the old branch-per-change + PR flow.)

> README.md predates the Pages→Worker migration — ignore its `pages:dev` references;
> the real full-stack command is `npm run cf:dev`. **DEPLOY.md is the current source of truth.**

---

## Architecture

### One Worker, two request kinds

`worker/index.ts` is the only deploy target. Every request is one of:

- **non-`/api/*`** → served from `env.ASSETS` (the built SPA in `dist/`; unknown
  paths fall back to `index.html` for client-side routes).
- **`/api/*`** → dispatched through `worker/routes.ts` to a handler under
  `functions/api/`. **Exception:** `GET /api/live` is intercepted before the table
  for a WebSocket upgrade into the `RealtimeHub` Durable Object (see _Realtime_).

**The handlers under `functions/api/` are unchanged Cloudflare _Pages_ Functions.**
The app began on Pages; the Worker keeps that code intact by adapting each Worker
request into the `EventContext` a Pages Function expects, and reproducing the old
`_middleware.ts` (CSRF gate + error boundary) inline in `index.ts`. So:

> **Adding a `/api/...` endpoint needs BOTH** a handler file under `functions/api/`
> **AND** an entry in the `TABLE` in `worker/routes.ts`. File path is no longer routing.

### Backend handler convention (`functions/_lib/`)

- **`authed(handler, scope?)`** (`route.ts`) wraps every household endpoint. It
  resolves the actor, returns 401/403 if missing/under-privileged, adds an error
  boundary, and hands the handler a guaranteed `Actor`. You can't get an actor
  without passing auth — the guard is structural. Pass `'operator'` to reject kiosk
  devices (member admin, destructive ops). A **guest** actor is blocked centrally:
  `authed()` 403s any non-GET/HEAD from a guest before the handler runs, so a guest
  is read-only across every endpoint without per-handler changes. **New handlers use
  `authed()`** rather than hand-rolling the guard.
- **`requireActor` / `resolveActor`** (`household.ts`) is the single place that
  answers "which household, and may it write?". Three credentials converge to one
  `Actor` shape: an **operator** session cookie (full read/write), a **kiosk**
  device token (board-scoped), or a **guest** token (read-only, time-boxed — the
  babysitter). One household per operator email (prototype-simple).
- **`auth.ts`** — HMAC-SHA-256 tokens sharing one key: operator session cookie
  `bb_session` + double-submit CSRF `bb_csrf`; device **and** guest tokens sent as
  the `X-Device-Token` header (or `?t=<token>` for the WS handshake, which can't set
  headers) and verified by the shared `verifyDeviceToken`/`verifyGuestToken` helpers.
  `SESSION_SECRET` is validated ≥32 chars at use — do not weaken (encoding `undefined`
  yields a known, forgeable key).
- **`json.ts`** — `ok`/`unauthorized`/`forbidden`/`notFound`/`serverError` helpers.
- **Migrations** (`functions/db/migrations/NNNN_*.sql`) are **forward-only and
  filename-locked**. Never rename or edit an applied one; add the next number.

### Schema conventions (every new migration follows these)

> Canonical naming rules for new tables/columns, so the schema stops accumulating
> drift. These are **forward rules**: adopt them for all new migrations. (Existing
> outliers are tracked in `UNIFORMIZING.md` Part I §5 / Part II §D and converged only
> during the one-household migration window — don't retro-churn a working table just
> to match a name.) The calm-tenet test (`calm-tenets.test.ts`) still overrides
> everything: no `streak`/`points`/`badge`/`push_subscription` table, no inventory
> `quantity`/`stock_count` column, ever.

- **Timestamps** — `created_at` (all rows), `updated_at` (anything mutable),
  `deleted_at` (soft delete). Don't coin a bespoke name (`archived_at`,
  `dismissed_at`) unless the semantic is genuinely different from "deleted" — and if
  so, comment why. _Sanctioned exception:_ `carnets.archived_at` is a **reversible
  archive** (a carnet + its descendants hide but can be restored), deliberately not
  `deleted_at` — keep it.
- **Status vs status code** — `status` is a workflow-state discriminator
  (staged/resolved/draft/active/frozen…). If a column stores an **HTTP status
  integer**, name it `status_code` (as `idempotency_keys.status_code` does) so it
  never reads as workflow state.
- **Colour** — one spelling: **`colour`** (matches members/businesses/pets/groups).
  Never add a new `color` column. (Existing `color` outliers: `tasks`,
  `home_projects`, `schedule_blocks`, `carnets`, + JSON keys.)
- **Ordering** — **`position`** (integer). Not `sort_order`, not `sort`.
- **Media attachment** — the **`media_kind` + `media_key` (+ `scene_key` for editable
  drawings)** trio (as on notes/family_notes/postbox/drawings), a single column per
  blob — never parallel arrays, never a new `r2_key`/`photo_key`/`image` name.
  **Lifecycle (P2-8 — the one memo-media pattern):** the composer uploads the blob via
  **`uploadMedia()`** → gets back an opaque `{key}` → writes that into `media_key` with
  the matching `media_kind` (and `scene_key` for a re-editable drawing). The pair is an
  **invariant: `media_key` is set iff `media_kind` is set** — never one without the
  other. Replacing or clearing the attachment **frees the old R2 blob** (`deleteR2Blob`,
  which no-ops on an unset bucket); R2 unset → the media controls **hide** and the
  text-only path still works. The board fridge-note composer (`MemoControls`) already
  shares this across endpoints via its `endpoint`/`affectedKey`/`extraBody` props — a
  new memo surface reuses it rather than re-wiring the upload→key→clear flow.
- **Attribution ("who")** — a **soft `TEXT` member ref, nullable, no FK** so deleting
  a member never cascades old content. When you need role / timestamp / multiple
  authors, use a **junction table** (like `task_participants`). Comment whether the
  ref means *subject/scope* or *author* (they've been conflated before — e.g.
  `member_id` is *scope* on notes but *author* elsewhere). **Three distinct "who"
  patterns coexist on purpose (DB-5) — pick by who's writing, don't unify them:**
  (1) **soft member ref** (`member_id`/`added_by`/`suggested_by`) — an *existing*
  household member is the subject or author; (2) **`author_member_id`** — a second,
  explicitly-the-author member ref where a row also carries a separate subject/scope
  member ref; (3) **external `author_label` / `sender_name`** — a free-text name from
  someone who is *not* (yet) a member (a relative via a guest link). Pattern (3)'s model
  is **postbox**: the sender's typed name tints the resulting note to a member **only on
  an exact name match**, never to whoever is reviewing — the template for any future
  guest→household attribution.
- **Discriminators** — **`kind`** for an entity sub-type, **`status`** for workflow
  state, **`type`** only for a relationship-edge label. Don't reuse `status` for an
  HTTP status integer (name it `status_code`).
- **JSON columns** — default arrays to `'[]'`, objects to `'{}'`, always `NOT NULL` —
  never a bare `NULL` a reader has to guard.
- **Soft refs** — every `*_by` / `*_id`-without-FK gets a one-line comment naming the
  soft-ref intent (so the missing FK reads as deliberate, not forgotten).
- **Household config** — if you'd add a 5th-plus new preference column to
  `households`, create a `household_preferences` table instead of widening the tenant
  row.

### Optional bindings degrade gracefully (`functions/_lib/env.ts`)

`DB` and `SESSION_SECRET` are required; **`AI`, `PHOTOS` (R2), `REALTIME_HUB` (the
Durable Object), and `LOGIN_PASSWORD` are optional** and guarded at entry. AI-unset
→ capture falls back to a manual type-picker, recap/suggestions hide. R2-unset →
photo / routine-voice-clip / recipe-step-photo features hide. DO-unset → `/api/live`
503s and clients poll. Never assume an optional binding is present. Locally without
`wrangler login`, `AI` is unavailable — that's the expected degraded path, not a bug.

### Frontend (`src/`)

- **`src/lib/api.ts` is the ONLY path to `/api/*`.** It attaches CSRF echo, the
  device token, locale (`X-Lang`), the acting profile (`X-Profile`), and credentials.
  Calling `fetch` directly loses one of these and gets a silent 403/wrong attribution.
- **TanStack Query owns all server state** and freshness/offline grace. The board
  polls and keeps the last good frame on a failed poll. Cross-page query keys live in
  `src/lib/queryKeys.ts` (a key spelled twice drifts into two caches); page-local keys
  sit beside their code. **Realtime** (`src/lib/realtime.ts`, gated by
  `REALTIME_ENABLED` in `main.tsx`) only _nudges_ this: a WS `invalidate` message
  calls `invalidateQueries` so an open board refreshes the moment another device
  writes. It never replaces Query or polling — if the socket drops, polling still owns
  correctness. Server side, the write path's broadcast hook in `route.ts` maps the
  request path → affected keys via `keysForPath` (`_lib/realtime.ts`) and fans them
  out through the `RealtimeHub` DO; it's fire-and-forget (`waitUntil`, errors
  swallowed) and never touches the response.
- **Routing** (`src/router.tsx`): `/` is a smart entry (marketing for a brand-new
  visitor; otherwise → `/board`). The six themed tabs (`/board`, `/kitchen`,
  `/liste`, `/notes`, `/maison`, `/settings`) render inside `HubLayout`. `/pair`,
  `/login`, `/signup` are standalone. `/share` is the PWA **share-target** landing
  (#13: manifest `share_target` → pre-fills the capture spine). Three **legacy hub
  routes** live on as query-preserving redirects (`LegacyHubRedirect`, which the
  plain `<Navigate>` isn't — it drops search params): `/routines` → `/maison`,
  `/cercle` → `/maison` (but `?section=notes` → `/notes`, keeping `?item`), and
  `/kid` → `/maison`. Every `/cercle/<segment>` **scene** path is frozen and
  unchanged (`/cercle/person|family|pet/*`, `/cercle/carnet/:id`, `/cercle/monde`,
  `/cercle/import` — that last one is in already-texted family-share links), as are
  the `/routine/*` builder scenes.
- **Two orthogonal presentation axes**, both React contexts persisted to
  localStorage, both overridable by URL param — **neither is a permission boundary;
  auth still gates writes server-side**:
  - **Surface** (`lib/surface.ts`): `kiosk` (wall tablet) vs `mobile` (phone) — the
    device _role_, chosen at setup. `?surface=`.
  - **Audience** (`lib/audience.ts`): `parent` vs `toddler` — the presentation _lens_.
    Every themed tab except Réglages renders both ways off the same data. `?kid=1`
    boots a kiosk **locked** into toddler view (settings hidden, `/settings` redirects).
- **i18n** (`src/i18n.ts`): `typeof FR` is the compile-time parity contract — EN must
  have every key FR has or `tsc` fails. Register is **Québécois** (souper, céduler,
  courriel), not France French.
- **Calm** (`lib/calm.ts`): a toggle that softens only _interaction_ friction (kid
  routine redo). The **structural** calm guarantees (no points, no push, finite lists)
  are **not** toggleable.

### The calm tenet is enforced by a test, not a convention

`functions/db/migrations/calm-tenets.test.ts` scans **every** migration and fails the
build if the schema ever grows a `streak`/`points`/`badge`/`push_subscription` table
or a pantry `quantity`/`stock_count` column. The anti-addiction, no-inventory stance
can't drift in by accident. Keep it green.

### The demo is a sandbox household (guest link as fallback)

There is no demo mode, route, or flag. `POST /api/demo` (`functions/api/demo.ts`,
CSRF-exempt) mints a **per-visitor throwaway SANDBOX**: a real seeded household with
a real operator session (`demo-<id>@babillard.invalid`, RFC 2606), so the visitor can
genuinely write — no new auth mode. Bounds: `DEMO_SANDBOX_TTL` (24 h; every mint runs
a bounded sweep, `functions/_lib/demoHousehold.ts`, whose table inventory is
build-guarded by `demoHousehold.test.ts` — a new migration table MUST be added to its
sets) and `DEMO_SANDBOX_CAP` (past it the endpoint falls back to the legacy behaviour:
find-or-create the read-only singleton demo household, reseed if stale, mint a
**4-hour read-only `showcase` guest token** → `/board?guest=<token>`). The sweep
deleting the sandbox's `operators` row is the session kill switch. **Shipped:** the
« Garder ma maisonnée » claim flow — `POST /api/demo/claim` (sandbox-operator-only,
signup-grade validation + invite gate) rewrites the operators row's email + password
**in place**, so the household, its data and the session survive while the email-LIKE
sweep/cap stop matching it; the board claim banner (`SampleBanner`'s sandbox face,
`lib/demo.ts` `useSandbox()`) links to the `/garder` form.

The fallback (and any operator-minted showcase link) is an ordinary guest, so
**whatever a guest can't do, that fallback can't show** — `isGuest()` stays
load-bearing for marketing, and it is easy to over-apply:

- **`isGuest()` means "can't write to the household."** Guard `/api/*` mutations with
  it (`writeWith` already refuses one structurally) and hide the controls that fire
  them. Three independent layers back this up — client, `authed()`, and the
  `guestScope.ts` allowlist — so relaxing the client guard alone can't leak a write.
- **Device-local preferences are NOT writes.** Theme, language, contrast/text size, the
  audience lens, read-aloud voice, calm mode, the screensaver and the board's card
  layout (`lib/boardCards`) all live in this browser's localStorage. A guest may use
  them; the household never sees it. `display.tsx`, `boardLayout.tsx` and `Board.tsx`'s
  `canEdit` are the reference call sites.
- **Réglages stays reachable for a link guest**, narrowed by the `GUEST_SUBS` allowlist
  in `pages/Operator.tsx`: Découvrir + « Comprendre » on every tab, plus the five
  device-local subs. It's an allowlist on purpose — a sub added later must not open
  itself to the demo. (`kitchen ▸ apparence` looks device-local but `MeasureColorsSection`
  PATCHes `/api/household`, so it stays out.)
- **Privacy hides are separate and stay.** `MotsCard`, `home-pins` and `care-log` hide
  from a guest because an operator can mint a `showcase` link to their **own** household
  (Réglages ▸ Partage), not just to the fake demo one. Don't relax those on `guestKind`.
- The **auto-launching tour** is deliberately off for guests: its script narrates the ＋
  FAB, which a read-only session doesn't have. Replaying it by hand from a guide card
  works (`TourOverlay` centres a step whose anchor is missing).

Guards: `e2e/guest-settings.spec.ts` and the guest cases in `e2e/board-edit.spec.ts`.

**Shipped 2026-07-13:** the interactive demo — per-visitor ephemeral household (seed
on mint, bounded TTL-sweep on the next mint, cap → read-only fallback). Accepted,
deliberately ungated costs: a sandbox can call AI endpoints and upload R2 media (both
bounded by TTL + cap; the sweep frees the blobs its `MEDIA_*` inventory knows).

### PWA / offline

`vite.config.ts` generates `dist/sw.js` at build time with the real hashed asset list
baked in, so a kiosk reboots offline. Policy: navigations network-first→cached shell;
`/api/img/*` + `/api/flyer-img` cache-first (immutable); other `/api/*` untouched
(Query owns freshness).

Beyond the shell, the **query cache is persisted** to IndexedDB (`src/lib/persist.ts`)
and restored before first paint, and **offline writes are queued + replayed** through
an outbox (`src/lib/outbox.ts` + `useWrite` in `src/lib/write.ts`), deduped server-side
by an idempotency key (`functions/_lib/idempotency.ts`). New writes should use
`useWrite()`, not `api()` directly; online-only controls disable via `useOnline()`.
**See [`OFFLINE.md`](./OFFLINE.md) for the full architecture, migration status, and
known limitations.**

---

## Shared jargon

Use these names in conversation and code so we mean the same thing. Many already
appear as code identifiers, route names, or `bmad/` requirement tags.

### Surfaces & audiences

| Term             | Means                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Surface**      | Device _role_: **kiosk** (wall tablet, glanceable, shared) vs **mobile** (phone, on-the-go). `lib/surface.ts`. |
| **Audience**     | Presentation _lens_: **parent** vs **toddler** (pre-reader). `lib/audience.ts`.                                |
| **Locked kiosk** | A tablet booted `?kid=1` — toddler audience, can't flip back or reach settings.                                |
| **Operator**     | The signed-in human who owns the household (full read/write).                                                  |
| **Guest**        | A time-boxed **babysitter** session booted `?guest=<token>` — read-only, no settings/writes; operator issues it from Réglages. |
| **Actor**        | Resolved request identity — operator, kiosk, **or guest** — that handlers act on.                              |

### Sections / themed tabs (the hub routes, canonical importance order)

The nav order below is THE canonical order — the hub nav (`HubLayout` TABS), the
themed Réglages tabs (`Operator` SECTIONS) and the guide taxonomy (`CONCEPT_THEMES`)
all follow it, and each section owns one colour (`SECTION_TINT`).

| Tab          | Route       | French name  | What it is                                                                                   |
| ------------ | ----------- | ------------ | -------------------------------------------------------------------------------------------- |
| **Board**    | `/board`    | Le babillard | Kiosk glance surface: clock, agenda, "ce soir" (supper), the list, chores, upcoming. A **widget space**: every card lives in a zone (`band` on top, `grid` = the masonry), with a width and an empty-card mode. Hold a card → edit mode (`?edit=1`); Réglages ▸ Disposition is its accessible mirror. |
| **Kitchen**  | `/kitchen`  | La cuisine   | Garde-manger: 7-day supper plan, recipes, "running low," meal suggestions, deals/flyers.     |
| **Liste**    | `/liste`    | La liste     | The single active shared list (see below).                                                   |
| **Notes**    | `/notes`    | Les notes    | The durable family-notes board (`family_notes`), for one member or the whole Maisonnée — rich notes, voice memos, drawings. Teal, inherited from Le cercle, where it used to be a sub-tab. Comprendre-only in Réglages (no settings subs). Distinct from the board's fridge **mots**. |
| **Maison**   | `/maison`   | Maison       | Routines **and** the rest of Le cercle, behind five pills (`?section=`): **routines** (default) · family · social · business · carnets. Kid picture-card routines read aloud on-device (absorbed the old `/kid` view) + the family & contacts directory: people, pets, groups, businesses, links/tree. Berry, inherited from Routines. |
| **Réglages** | `/settings` | Réglages     | Operator hub, rebuilt as **Découvrir + six colour-themed tabs** (one per hub section, same order/colours as the nav). Each themed tab has a **« Comprendre / Régler »** lens toggle: Comprendre = that theme's slice of the in-app guide (`ComprendrePanel`), Régler = its settings sub-sections (`?tab=<SectionKey>&lens=&sub=`; old ids fold via `LEGACY_TAB`). The sage « Système » tab holds device/household-wide machinery (pairing, guests, display, veille, photos, IA, voix, calme, diagnostics). Operator-only; a kiosk sees all tabs but the member-admin/pairing/guest subs drop (per-sub gating). |

### Domain concepts (carry specific meaning here — see project memory)

| Term                         | Means                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capture / capture spine**  | Type-or-speak a note; Workers AI routes it to event/task/list-item/pantry-low/meal/note. `AddSheet` (the contextual ＋ FAB sheet).                                    |
| **The list (single-list)**   | `/liste` is ONE active list — check marks in place, "Clear checked" logs + removes; no done-shelf/modes (those were removed). `search_terms` survive a re-add. |
| **Garde-manger**             | The kitchen module: meal planning that fills the grocery list itself. No full inventory — only "running low."                                                  |
| **Pantry-low / running low** | A low/out flag, deliberately NOT an inventory count (enforced by the calm test).                                                                               |
| **Deal ↔ item**              | Flyer deals are transient and ride on a generic recurring list item — never rename/duplicate it into a specific-named one.                                     |
| **Ghost**                    | Opt-in purchase tracking. Buying never auto-enrolls — don't reopen auto-learning.                                                                              |
| **Cook mode**                | Full-screen recipe view; follows the audience profile; exit via small ✕. `CookMode`. Each ingredient carries **« Il en manque »** — the same pantry-low write the Garde-manger uses, so noticing you are out mid-recipe costs no trip off the scene (parent + non-guest; a TOGGLE — the undo bar sits at z-index 40 under the scene’s 90, so an « Annuler » from here would be unreachable, and the button’s own state is the confirmation). |
| **Cashier mode**             | In-store list/price-match surface. `CashierMode`.                                                                                                              |
| **Recipe sections**          | Inline `## Title` lines inside flat ingredients/steps arrays (no separate table) — every iterator must skip headings.                                          |
| **Measure pills**            | Colour-coded tap-to-hear spoon/cup amounts in recipes (`measureColors.ts`).                                                                                    |
| **Calm mode**                | Opt-out of kid-routine redo friction only; structural calm guarantees are non-toggleable.                                                                      |
| **Pairing**                  | Tablet shows a 6-digit code; operator approves from `/settings`; tablet stores a revocable device token.                                                       |
| **Day-part theming**         | The board palette gently drifts dawn→day→dusk→night (`data-daypart` over `data-theme`); opt-out toggle, never overrides manual Night. `lib/timeofday.ts` + `lib/daypartDrift.ts`. |
| **Recipe collections**       | Browse recipes grouped by an existing **tag** (no new table); parent = an **"Aa vs Collections" view toggle** in the recipe book (`RecipesTab`): Aa = flat alphabetical, Collections = grouped-by-tag sections (no sub-tabs) + toddler hear-first picker (`KidCollections`).                    |
| **Chore ledger**             | Read-only "who did what this week" glance (Réglages ▸ Corvées) over `task_participants` — names + faces, **never counts/ranks** (calm).                         |
| **Voice clip / step photo**  | Optional R2 media: a parent's recorded narration per routine card, and a photo per recipe step (parallel arrays; degrade to TTS/text when R2 unset).            |
| **Fridge memos**             | A fridge note (`notes`, board `Notes.tsx`) can carry an R2 attachment — `media_kind`: an **audio memo** (#38), a **drawn note** (#14 — `DrawPad` over `signature_pad`), or a **shared photo** (#13 — `'image'`, from the share-target). Audio/drawing are created in the ＋ "Note rapide" sheet (`MemoControls`); a photo arrives via `/share`. General-audience, tinted by the active face; clearing frees the R2 blob. Migration 0043 (`media_kind`/`media_key`); upload via `note-media`. R2 unset → the controls hide, text notes still work. |
| **Favorites (hearts)**       | Per-member ❤ on a recipe (#21, `recipe_loves`, migration 0044; `HeartButton`/`useLoves`); a planned meal carries its linked recipe's hearts. **Calm: shows WHICH faces loved it, never a count/rank** (chore-ledger rule). The add/remove toggle only shows when a face is picked — as **Maisonnée** hearts are read-only. Biases `suggest-meal` (loved recipes lead "favs"). |
| **Realtime**                 | Per-household `RealtimeHub` Durable Object nudges open boards via `/api/live` WS to refresh on another device's write; **polling stays the fallback**.          |
| **Idle / ambient**           | What a **kiosk** does at rest, both opt-out-able + tunable in **Réglages ▸ Affichage ▸ Mode veille** (`lib/ambient.ts`, `useSyncExternalStore`): (1) the **screensaver** (`AmbientScreen`) fades to a full-screen clock/date/photo-frame/next-up after `idleMin`; tap to wake. (2) the **return-home drift** clears the picked face back to "Maisonnée" after `returnHomeMin` (heads-up chip 30 s before). Both live shell-level in `HubLayout` (one idle effect, resets on any pointer/key; arms on **every** surface — mobile included, since a wall tablet is often signed in as the operator and thus `surface=mobile` — and is governed purely by the per-behaviour opt-out toggles). Test without waiting with **« Aperçu »** in that same sub, which calls `forceIdle('screensaver')` (`lib/idleDebug.ts`). *(Corrected 2026-08-27: this row used to promise a « Réglages ▸ Debug » panel in `operator/idleDebug.tsx` that shrinks the idle window to seconds. That file does not exist and never did — the speed half of `idleDebug` had no UI, and its setters were removed as dead exports when knip became a real gate. `SPEED_KEY` is still read by HubLayout, so setting it by hand in devtools does still work.)* |
| **Discovery (comprendre ↔ agir)** | The one guide/help/tour ↔ feature/settings mapping: **32** guide cards today against a **~32 merge-first ceiling** (at capacity — merge before you add a 33rd), each a launcher (« Ouvrir »/« Régler »/« Essayer ») as well as an explanation; "?" hints + tours deep-link back via `?card=&point=`; `?focus=` lands on a stacked settings card, `?plus=` opens the ＋ sheet; `SUB_GOTO` links a Réglages sub to its live surface. **See `DISCOVERY.md`** — taxonomy, URL grammar, invariants, checklists. |

### Requirement tags

Comments cite `bmad/` tags: **`NFR-*`** (non-functional, e.g. `NFR-CALM-1`,
`NFR-OFFLINE-1`), **`PRD <id>`** (product requirement, e.g. `PRD C5`), **`OD-*`**
(open decision). Grep `bmad/` for the tag to find the rationale.

---

## Horizontal overflow

New UI that bleeds off the right edge on a narrow phone is a **recurring** bug here.
The cause is almost always a hand-rolled `display:flex` row of buttons/chips, and the
reason it ships unnoticed is that `#root`, `.hub__body`, and `.sheet` all set
`overflow-x:hidden` — so a too-wide row is **clipped (hidden), not fixed**, and a
`scrollWidth`-based check reads it as 0. Prevent it structurally:

- **Use a row primitive, never a bespoke flex row.** `<Cluster>` (wraps to a second
  line) for order-independent rows; `<Rail>` (scrolls one line) for sequences that must
  stay inline. `components/Layout.tsx`; classes `.cluster`/`.rail` in `core.css`; live
  in `/dev/kit` ▸ Fondations ▸ *Cluster · Rail*. `<Cluster fill>` = "grow to share the
  row but still wrap when narrow."
- **A fixed `flex-basis` is the trap.** `flex: 1 1 6rem` on three buttons keeps them on
  one line and overflows instead of wrapping, because a basis *smaller than the item's
  content* under-reports the width so wrap never triggers. Basis `auto` (what
  `.cluster--fill` uses) tracks the content and wraps honestly. If you catch yourself
  writing `flex: 1 1 <rem>`, reach for `Cluster`/`Rail` instead.
- **A labeled submit beside a field is the same trap wearing a suit.** `flex: 1 1
  10rem` on `.edit-field__box` kept the CTA on one line forever; the field was
  never allowed to wrap under it. It is now one container query in
  `styles/pages/fields.css` (`.edit-field--cta` → box full line, button beneath),
  inherited by every EditField/EntityCombobox — extend that, never re-pin a basis
  on a host (`field-fit.test.ts` fails the build if you do).
- **Never add `overflow-x:hidden` to *mask* a wide row** — that hides the bug from the
  eye and the guard both. The container clips are there to stop page-panning, not to
  paper over content that's too wide.
- **The guard is a per-child bounds check, not `scrollWidth`.**
  `e2e/add-sheet-overflow.spec.ts` measures each visible descendant's right edge vs the
  sheet's right edge (which sees through the clip) and exercises the sheet in several
  states. When you add a new sheet/overlay row, extend that spec (or the phone-width
  sweep in `e2e/screenshots.spec.ts` / `e2e/layout-overflow.spec.ts`) to open it.

### A scrolling row must be reachable with a mouse, not just a thumb

The mirror-image bug. Every side-scrolling row here hides its scrollbar for calm
(`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`). On a touch screen you
swipe it. **On a desktop that hides content outright**: there's no bar to drag, no swipe,
and a mouse wheel only ever emits `deltaY` — which no browser maps onto a *horizontal*
scroller. Réglages ▸ Régler ▸ Système's nine subs were simply unclickable with a mouse.

- **Any hidden-scrollbar horizontal row gets `useHScroll()`** (`lib/hscroll.ts`). It maps
  the wheel, hands it back to the page at either end (never a wheel trap), and exposes
  `overflowing`/`atStart`/`atEnd` + `page()`/`toView()`. No DOM, no layout change.
  `Rail` and `SubTabs` already wire it; a hand-rolled row must attach the ref itself.
- **Don't leave a touch gesture as the ONLY path to an action.** A swipe
  (`useSwipeToDelete` binds `touchstart/move/end` — invisible to a mouse *and* a
  keyboard) or a long-press needs a real mirror: `RowActions`, an edit sheet's Delete,
  or a Réglages screen. Same for any decorative overlay — an `aria-hidden`, `opacity:0`
  pane that still takes hits (`.list-row__del` before `pointer-events:none`) silently
  swallows clicks on the controls beneath it.
- Guards: `e2e/hscroll.spec.ts` (wheel, chevrons, no wheel trap, deep-link scroll-in)
  and `e2e/quickadd-remove.spec.ts` (mouse+keyboard delete, pane doesn't eat clicks).

## Conventions & gotchas

- **Reuse before you create** (standing rule). Read the existing section + check
  `COMPONENTS.md` / `/dev/kit` for a shared primitive and `src/lib/*` for the
  governing helper BEFORE writing new code. Extend what exists; don't fork a parallel
  copy that we then have to refactor back. See [Build by reuse](#build-by-reuse--read-before-you-write-start-here).
- **Keep the surface lean** (standing rule): a new heading, hint line, always-open
  composer or search box needs to justify the screen it takes before the content.
  Read **`LEAN.md`** — the nine recurring smells with the primitive that fixes each
  (**SectionAdd** / **SearchField** / **Disclosure**), the three invariants (a fold
  never hides a filled field; never delete an explanation nothing else carries;
  don't cargo-cult a fix), and the method that actually finds them: **screenshot the
  first screen at 390px and look — do not reason about it.** The state matrix
  measures it (`npm run e2e:matrix` → `contentTopPx` per surface, ratchet-budgeted),
  so a surface can't quietly regrow its chrome.
- **…and generous once you're inside** (standing rule, the same file's other half):
  lean governs a surface you SCAN; a composer you deliberately opened — the ＋
  sheet's field, an expanded `SectionAdd`, a scene form — is the opposite case, and
  it regressed the opposite way (« Restants » at 390px: a full-width « ＋ À finir
  bientôt » left ~60px of typing width). A labeled CTA takes its own line **under**
  a full-width field; the side margin of a sheet/scene is `var(--gutter)`, never a
  hard-coded px. Guards: `e2e/composer-fit.spec.ts` (a typing-width FLOOR, which
  only moves up, + « the placeholder must fit ») and `src/styles/field-fit.test.ts`
  (the CSS invariants). See [Generous inside](./LEAN.md#generous-inside-the-other-ratchet).
- **Every UI change must be mobile-friendly**, every time (standing rule).
- **Every UI change must be tablet-friendly, especially for Toddler mode**, every time (standing rule).
- **No horizontal overflow** — any row of controls uses `Cluster`/`Rail`, not a
  hand-rolled flex row (standing rule). See [Horizontal overflow](#horizontal-overflow).
- **Every UI change must be desktop-friendly too** (standing rule): nothing may be
  reachable *only* by a touch gesture. A hidden-scrollbar side-scrolling row gets
  `useHScroll()`; a swipe or long-press gets a mouse/keyboard mirror. See
  [A scrolling row must be reachable with a mouse](#a-scrolling-row-must-be-reachable-with-a-mouse-not-just-a-thumb);
  the full action × door matrix (with each gesture's mirror) is **`ACTIONS.md`**.
- **A new Réglages setting merges into an existing sub, never a new pill**
  (standing rule, C-15). Réglages already counts 30-ish subs; find the themed
  tab + sub that already owns the concept (e.g. any kitchen colour/appearance
  setting → `kitchen ▸ apparence`, stacked `OperatorSection` bodies under one
  pill, the board▸thisweek / settings▸system precedent) and stack your section's
  body there instead of widening the pill row.
- **A new guard must be run against the bug it was written for, before it is
  trusted** (standing rule). The build-gating grep tests (`calm-tenets`,
  `field-fit`, `keyboard-fit`, `write-rule`, `nested-interactive`, `discovery`,
  `demoHousehold`, `realtime`) are the best thing in this codebase — and a green
  one proves nothing on its own. `nested-interactive.test.ts` was written to catch
  a control-inside-a-control on the routines grid and reported GREEN over exactly
  that defect: it walked JSX by indentation, and prettier breaks a multi-attribute
  open tag right after the tag name, so `<div` is the whole line and the walk ended
  on the element's own first line. Re-counted by tag depth it went red — and found a
  third case nobody had reported. Stash the fix (or plant a violation), watch the
  guard fail, then restore. Two lines of shell; it is the difference between a test
  and a decoration.
- **Push straight to `main`** — no PR branches; CI (typecheck/test/build) is the
  only gate, fix forward if it goes red (standing rule). If a branch ever is used,
  delete it (local + remote) after it merges.
- **Shared working tree** — concurrent Claude sessions share this checkout. Re-check
  git state before committing; stage explicit paths; verify `HEAD` after commit.
- **`src/styles/styles.css`** `@import` order IS the cascade — never reorder.
- Don't commit to the parent `FULL_LIFE_AS_CODE` folder (not a git repo). This project
  (`PlannerOrSomething/`) is its own git repo — commit here.
- The `database_id` in `wrangler.toml` is the original author's DB; a fresh account
  must replace it.
