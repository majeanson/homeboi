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

## Commands

```bash
npm run dev            # Vite frontend-only, HMR on :5173, /api proxied to :8787
npm run cf:dev         # full stack: wrangler dev on :8787 (SPA + Worker + local D1)
npm run build          # tsc -b (typechecks SPA + Worker + Functions) then vite build → dist/
npm run typecheck      # tsc -b --noEmit
npm test               # vitest run (pure-logic unit tests)
npm run test:watch     # vitest watch
npm run e2e            # Playwright (boots its own Vite, stubs every /api/* — no D1/secrets)
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
**gates** `db:migrate:prod` + deploy on `main`. E2E (Playwright) runs in **parallel**
for signal but does **not** block the deploy, so main ships as soon as
typecheck/test/build are green. **Trust CI as the baseline; don't run e2e locally by
default — check the E2E job on the run page for visual/flow regressions.** Node 24.

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
  `/signup` are standalone. `/kid` is legacy → redirects to `/routines`.
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

### Sections / themed tabs (the five hub routes)

| Tab          | Route       | French name  | What it is                                                                                   |
| ------------ | ----------- | ------------ | -------------------------------------------------------------------------------------------- |
| **Board**    | `/board`    | Le babillard | Kiosk glance surface: clock, agenda, "ce soir" (supper), the list, chores, upcoming.         |
| **Kitchen**  | `/kitchen`  | La cuisine   | Garde-manger: 7-day supper plan, recipes, "running low," meal suggestions, deals/flyers.     |
| **Routines** | `/routines` | Routines     | Kid picture-card routines, read aloud on-device (absorbed the old `/kid` view).              |
| **Liste**    | `/liste`    | La liste     | The single active shared list (see below).                                                   |
| **Réglages** | `/settings` | Réglages     | Operator hub: members, devices, chores/rotation, routines, display, shopping. Operator-only. |

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
| **Recipe collections**       | Browse recipes grouped by an existing **tag** (no new table); parent grid (`CollectionsTab`) + toddler hear-first picker (`KidCollections`).                    |
| **Chore ledger**             | Read-only "who did what this week" glance (Réglages ▸ Corvées) over `task_participants` — names + faces, **never counts/ranks** (calm).                         |
| **Voice clip / step photo**  | Optional R2 media: a parent's recorded narration per routine card, and a photo per recipe step (parallel arrays; degrade to TTS/text when R2 unset).            |
| **Realtime**                 | Per-household `RealtimeHub` Durable Object nudges open boards via `/api/live` WS to refresh on another device's write; **polling stays the fallback**.          |
| **Idle / ambient**           | What a **kiosk** does at rest, both opt-out-able + tunable in **Réglages ▸ Affichage ▸ Mode veille** (`lib/ambient.ts`, `useSyncExternalStore`): (1) the **screensaver** (`AmbientScreen`) fades to a full-screen clock/date/photo-frame/next-up after `idleMin`; tap to wake. (2) the **return-home drift** clears the picked face back to "Maisonnée" after `returnHomeMin` (heads-up chip 30 s before). Both live shell-level in `HubLayout` (one idle effect, resets on any pointer/key; mobile exempt). Test without waiting via **Réglages ▸ Debug** (`lib/idleDebug.ts` + `operator/idleDebug.tsx`): shrink the window to seconds, or force the screensaver/warn/drift. |

### Requirement tags

Comments cite `bmad/` tags: **`NFR-*`** (non-functional, e.g. `NFR-CALM-1`,
`NFR-OFFLINE-1`), **`PRD <id>`** (product requirement, e.g. `PRD C5`), **`OD-*`**
(open decision). Grep `bmad/` for the tag to find the rationale.

---

## Conventions & gotchas

- **Every UI change must be mobile-friendly**, every time (standing rule).
- **Every UI change must be tablet-friendly, especially for Toddler mode**, every time (standing rule).
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
