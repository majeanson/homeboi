# Babillard

> Working name. A calm household command-center for a cheap always-on wall
> tablet: today's agenda, shared lists, chore rotation, "supper tonight," kid
> routines, and a kitchen/recipe planner — all glanceable from across the
> kitchen. A pre-reader can run their own morning routine on it.
>
> Built to be **useful at home first**, showcase-able second, and **calm by
> design** — no streaks, no points to hoard, no notifications pulling you back.
> The day's list empties and stays empty. UI copy is bilingual, **FR-CA
> (Québécois) first**.

---

## Status

**Live.** A single Cloudflare Worker (static SPA assets + `/api/*`) on D1,
Workers AI, R2, and a Durable Object for realtime. Deployed to production;
CI (typecheck → test → build) gates `db:migrate:prod` + deploy on every push
to `main`.

**Where the project stands right now** — health numbers, the map of which planning
documents still hold work, and the remaining backlog consolidated and ranked — is
[`STATE.md`](./STATE.md). Start there.

The planning that drove it lives in [`bmad/`](./bmad/): the
[brief](./bmad/01-brief.md), [PRD](./bmad/02-prd.md), and
[architecture](./bmad/03-architecture.md). Day-to-day contributor guidance —
architecture, conventions, and the "build by reuse" rules — is in
[`CLAUDE.md`](./CLAUDE.md); deploy steps are in [`DEPLOY.md`](./DEPLOY.md).

## The five hub tabs

| Tab | Route | What it is |
| --- | --- | --- |
| **Le babillard** | `/board` | Kiosk glance surface: clock, agenda, "ce soir" (supper), the list, chores, upcoming. Renders parent **and** toddler lenses off one dataset. |
| **La cuisine** | `/kitchen` | Garde-manger: 7-day supper plan, recipes, "running low," meal suggestions, deals/flyers. |
| **Routines** | `/routines` | Kid picture-card routines, read aloud on-device (absorbed the old `/kid` view). |
| **La liste** | `/liste` | The single active shared list — check in place, "clear checked" logs + removes. |
| **Réglages** | `/settings` | Operator hub: members, devices, chores/rotation, routines, display, sharing. Operator-only. |

Also: **Le cercle** (family/contacts directory + carnets), **La boîte aux
lettres** / share-links (time-boxed guest, babysitter, relative-inbox), and a
**capture spine** (type-or-speak a note → Workers AI routes it to the right
table).

## Two orthogonal presentation axes

- **Surface** — `kiosk` (wall tablet, glanceable, shared) vs `mobile` (phone).
  The device *role*, chosen at setup.
- **Audience** — `parent` (reader, detail peeks) vs `toddler` (pre-reader,
  hear-first tiles). Neither is a permission boundary — auth still gates writes
  server-side.

## Run it locally

```bash
npm install

# 1. Create the D1 database, paste the printed id into wrangler.toml.
npx wrangler d1 create babillard
#   -> set database_id in wrangler.toml [[d1_databases]]

# 2. Apply the schema to local D1.
npm run db:migrate:local

# 3. Set a session secret for local dev (>=32 chars).
cp .dev.vars.example .dev.vars   # then set SESSION_SECRET

# 4. Full-stack dev (SPA + Worker + local D1):
npm run cf:dev          # http://localhost:8787
```

Frontend-only fast loop: `npm run dev` (Vite on 5173, HMR; proxies `/api` →
the Worker on 8787, so run `cf:dev` alongside).

### The device-pairing flow, end to end

1. Open `/login` on your laptop and sign in. A household is created on first
   login.
2. On the "tablet" (a second browser/window), open `/pair` → **Get a code**.
   It shows a 6-digit code and starts polling.
3. Back on the laptop, go to `/settings` → approve the tablet by typing the
   code. The tablet's next poll collects its device token and opens `/board`.
4. Revoke it any time from `/settings` → paired devices.

### Optional bindings degrade gracefully

`DB` and `SESSION_SECRET` are required; **`AI`, `PHOTOS` (R2),
`REALTIME_HUB` (the Durable Object), and `LOGIN_PASSWORD` are optional**. AI
unset → capture falls back to a manual type-picker; R2 unset → photo / voice-
clip / step-photo features hide; DO unset → `/api/live` 503s and clients poll.
Locally without `wrangler login`, Workers AI is unavailable — that's the
expected degraded path, not a bug.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite frontend-only dev server (:5173, `/api` proxied to :8787) |
| `npm run cf:dev` | Full stack: wrangler dev (:8787) — SPA + Worker + local D1 |
| `npm run build` | `tsc -b` (typecheck SPA + Worker + Functions) then `vite build` → `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest (pure-logic unit tests, incl. the calm-tenet schema guard) |
| `npm run e2e` | Playwright (boots its own Vite, stubs every `/api/*`) |
| `npm run db:migrate:local` / `:prod` | Apply D1 migrations |
| `npm run deploy` | build + `wrangler deploy` |

## Stack

React 19 + Vite (SPA) served by **one Cloudflare Worker** that also dispatches
`/api/*` to handlers under `functions/api/` (unchanged Pages-Functions code,
adapted at the Worker boundary). **D1** for state, **Workers AI** for the
capture router + suggestions, **R2** for media blobs, a **Durable Object**
(`RealtimeHub`) for realtime nudges. Query cache is persisted to IndexedDB and
offline writes are queued + replayed. No state lib, no CSS framework — boring
tech on purpose.
