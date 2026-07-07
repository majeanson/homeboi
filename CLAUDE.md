# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: a separate `CLAUDE.md` one level up documents the broader LAC ecosystem.
> This file governs **Babillard** (the `PlannerOrSomething/` project) specifically.

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
   Cercle,Routines,Operator}.tsx` (Operator = Réglages); settings bodies live in
   `src/components/operator/*`; kitchen sub-tabs in `src/components/kitchen/*`. Grep
   the feature name first.
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
| In-page segmented sub-tabs ("one job at a time") | **`SubTabs`** (the `.subtabs` family) | `components/SubTabs.tsx` (help-mode aware; used by La cuisine + Le cercle) |
| A horizontal row of buttons / chips / controls | **`Cluster`** (wraps) / **`Rail`** (scrolls one line) — never a hand-rolled flex row | `components/Layout.tsx` (`.cluster`/`.rail` in `core.css`; see [Horizontal overflow](#horizontal-overflow)) |
| A dialog / bottom sheet | **`Modal`** + `useModal` / `useSwipeToDismiss` | `components/Modal.tsx`, `lib/useModal.ts` |
| A Réglages section wrapper | **`OperatorSection`** | `components/operator/OperatorSection.tsx` |
| Hub-tab / scene header | **`HubHead`** / **`SceneHead`** | `components/HubHead.tsx`, `components/SceneHead.tsx` |
| "Everything the app does" themed map / feature discovery | **`FeatureMap`** (the ONE taxonomy: `CONCEPT_THEMES`/`FEATURE_MAP_TILES` in `lib/guideContent`) | `components/FeatureMap.tsx` (reused by the Guide jump-grid, the Board `WelcomeCard`, DevKit — extend the taxonomy, don't fork a list) |
| Person photo/initial, mic, icon, image | **`Avatar`/`VoiceButton`/`Icon`/`ZoomableImg`** | `components/*` (pass a family/group `colour` so a photo-less member's initials disc takes the group colour) |
| Pick a household face (Maisonnée + members) | **`MemberSwitcher`** (the `.mswitch` "Aujourd'hui" row) | `components/MemberSwitcher.tsx` (controlled; board wraps it to `useProfile`, Le cercle picks locally) |
| Confirm a destructive delete / undo a light one | **`useConfirm`** / the undo toast | `lib/confirm.tsx`, `lib/toast.tsx` (`lib/undoStack.ts`) |
| Touch drag-and-drop / reorder | **`usePointerDnd`** | `lib/dnd.tsx` (never HTML5 `draggable`) |
| Upload a photo / audio / drawing blob to R2 | **`uploadMedia()`** / **`useMediaUpload()`** | `lib/uploadMedia.ts` (resize→POST→`{key}`, 503→`MediaUnavailableError`) |

### Cross-cutting conventions a new feature MUST respect

| Concern | Use | Don't |
| --- | --- | --- |
| Any `/api/*` write | **`useWrite()`** (`lib/write.ts`) | …call `api()` directly for writes (skips the offline outbox) |
| Any `/api/*` read/fetch | **`api()`** (`lib/api.ts`) | …`fetch` directly (loses CSRF, device token, locale, profile) |
| Server state / caching | **TanStack Query**; shared keys in `lib/queryKeys.ts` | …a parallel store, or a key spelled twice |
| Device role / presentation lens | **`useSurface()`** / **`useAudience()`** | …branch on width or invent a flag |
| Calm guarantees | structural ones are non-negotiable (a **test** enforces no streak/points/badge/push/inventory) | …add counts, ranks, streaks, points, push, or a quantity column |
| Backend endpoint | handler under `functions/api/` **+** `authed()` wrapper **+** a `TABLE` row in `worker/routes.ts` | …hand-roll the auth guard, or forget the route table |
| Delete / clear a row from a **live-polled** list | **`useDeferredRemoval(queryKey)`** (`lib/useDeferredRemoval.ts`) — `visible()` filters the rows, `remove()` holds the write behind the undo toast + awaits a refetch | …optimistically `setQueryData` then defer the write: the next poll resurrects the row mid-undo (flash-back glitch) |

**When you DO add a new shared component:** register it in `src/pages/DevKit.tsx`,
add it to `COMPONENTS.md`, and (if user-facing) document it in the in-app Guide
(`lib/guideContent.ts`). A new primitive that isn't in the gallery is invisible to
the next session and will get re-invented.

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
  visitor; otherwise → `/board`). The five themed tabs (`/board`, `/kitchen`,
  `/routines`, `/liste`, `/settings`) render inside `HubLayout`. `/pair`, `/login`,
  `/signup` are standalone. `/share` is the PWA **share-target** landing (#13:
  manifest `share_target` → pre-fills the capture spine). `/kid` is legacy →
  redirects to `/routines`.
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
| **Board**    | `/board`    | Le babillard | Kiosk glance surface: clock, agenda, "ce soir" (supper), the list, chores, upcoming.         |
| **Kitchen**  | `/kitchen`  | La cuisine   | Garde-manger: 7-day supper plan, recipes, "running low," meal suggestions, deals/flyers.     |
| **Liste**    | `/liste`    | La liste     | The single active shared list (see below).                                                   |
| **Cercle**   | `/cercle`   | Le cercle    | Family & contacts directory: people, pets, groups, businesses, links/tree.                   |
| **Routines** | `/routines` | Routines     | Kid picture-card routines, read aloud on-device (absorbed the old `/kid` view).              |
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
| **Cook mode**                | Full-screen recipe view; follows the audience profile; exit via small ✕. `CookMode`.                                                                           |
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
| **Idle / ambient**           | What a **kiosk** does at rest, both opt-out-able + tunable in **Réglages ▸ Affichage ▸ Mode veille** (`lib/ambient.ts`, `useSyncExternalStore`): (1) the **screensaver** (`AmbientScreen`) fades to a full-screen clock/date/photo-frame/next-up after `idleMin`; tap to wake. (2) the **return-home drift** clears the picked face back to "Maisonnée" after `returnHomeMin` (heads-up chip 30 s before). Both live shell-level in `HubLayout` (one idle effect, resets on any pointer/key; arms on **every** surface — mobile included, since a wall tablet is often signed in as the operator and thus `surface=mobile` — and is governed purely by the per-behaviour opt-out toggles). Test without waiting via **Réglages ▸ Debug** (`lib/idleDebug.ts` + `operator/idleDebug.tsx`): shrink the window to seconds, or force the screensaver/warn/drift. |

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
- **Never add `overflow-x:hidden` to *mask* a wide row** — that hides the bug from the
  eye and the guard both. The container clips are there to stop page-panning, not to
  paper over content that's too wide.
- **The guard is a per-child bounds check, not `scrollWidth`.**
  `e2e/add-sheet-overflow.spec.ts` measures each visible descendant's right edge vs the
  sheet's right edge (which sees through the clip) and exercises the sheet in several
  states. When you add a new sheet/overlay row, extend that spec (or the phone-width
  sweep in `e2e/screenshots.spec.ts` / `e2e/layout-overflow.spec.ts`) to open it.

## Conventions & gotchas

- **Reuse before you create** (standing rule). Read the existing section + check
  `COMPONENTS.md` / `/dev/kit` for a shared primitive and `src/lib/*` for the
  governing helper BEFORE writing new code. Extend what exists; don't fork a parallel
  copy that we then have to refactor back. See [Build by reuse](#build-by-reuse--read-before-you-write-start-here).
- **Every UI change must be mobile-friendly**, every time (standing rule).
- **Every UI change must be tablet-friendly, especially for Toddler mode**, every time (standing rule).
- **No horizontal overflow** — any row of controls uses `Cluster`/`Rail`, not a
  hand-rolled flex row (standing rule). See [Horizontal overflow](#horizontal-overflow).
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
