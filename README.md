# Babillard

> Working name. A household command-center for a cheap wall tablet: today's
> agenda, shared lists, chore rotation, and "supper tonight," all glanceable
> from across the kitchen. A pre-reader can run their own morning routine on
> it. The kitchen module (Garde-manger) plans meals and fills the grocery
> list by itself.
>
> Built to be **useful at home first**, showcase-able second, and **calm by
> design** — no streaks, no points to hoard, no notifications pulling you
> back. The day's list empties and stays empty.

---

## Status

**Functional prototype.** SPA + Pages Functions + D1 schema + the one AI
feature (capture intent-router). Build + typecheck + tests are green. Not yet
wired to a real D1 instance or deployed.

The planning that drove it lives in [`bmad/`](./bmad/): the
[brief](./bmad/01-brief.md), [PRD](./bmad/02-prd.md), and
[architecture](./bmad/03-architecture.md).

## What works in the prototype

- **Capture spine** — type or speak a note; Workers AI classifies it into
  `event / task / list-item / pantry-low / meal / note` and routes it to the
  right table. Voice uses the browser's on-device speech (zero Neurons). With
  AI unset it degrades to a manual type-picker, never losing the words.
- **The board** (`/board`) — kiosk surface: clock, today's agenda, "ce soir"
  (supper + cook), the shared list (tap to tick), chore rotation (tap done),
  upcoming. Polls every 20s; keeps the last frame and flips a "showing cache"
  stamp on a failed poll.
- **Garde-manger** (`/kitchen`) — 7-day supper plan, a "running low" list (no
  inventory), and the on-demand "qu'est-ce qu'on mange?" AI suggestion.
- **Kid view** (`/kid`) — big picture-card routines, read aloud on-device,
  deterministic done-state (no variable reward), empties when finished.
- **Device pairing** (`/pair` + `/settings`) — the tablet gets a 6-digit code;
  the operator approves it from their phone; the tablet stores a device token
  and opens the board. Revocable per device.
- **Operator hub** (`/settings`) — members, paired devices, chores +
  rotation, kid routines, pairing approval. Kiosk actors are refused here.

## Run it locally

```bash
npm install

# 1. Create the D1 database, paste the printed id into wrangler.toml.
npx wrangler d1 create babillard
#   -> set database_id in wrangler.toml [[d1_databases]]

# 2. Apply the schema locally.
npm run db:migrate:local

# 3. Set a session secret for local dev.
cp .dev.vars.example .dev.vars   # then put a >=32-char value in SESSION_SECRET

# 4. Full-stack dev (SPA + Functions + local D1):
npm run build           # produces dist/ for wrangler to serve
npm run pages:dev       # http://localhost:8788
```

Frontend-only fast loop: `npm run dev` (Vite on 5173, proxies `/api` →
wrangler on 8788, so run `pages:dev` alongside).

### The device-pairing flow, end to end

1. Open `/login` on your laptop, sign in with any email (prototype: no
   password). A household is created on first login.
2. On the "tablet" (a second browser/window), open `/pair` → **Get a code**.
   It shows a 6-digit code and starts polling.
3. Back on the laptop, go to `/settings` → **Approve a tablet**, type the
   code. The tablet's next poll collects its device token and opens `/board`.
4. Revoke it any time from `/settings` → Paired tablets.

### Notes / known prototype edges

- **AI is optional.** Locally, `wrangler pages dev` may need `wrangler login`
  to reach Workers AI; without it the capture bar uses the manual type-picker
  and `/kitchen`'s suggestion button hides. Everything else works. (See
  project memory on the wrangler 4.x remote-proxy trap.)
- **Login is email-only** for the prototype. The HMAC cookie + CSRF machinery
  is real; swapping in a magic-link flow (Resend) is a local change.
- **Single host.** Host→tenant routing has a table but isn't exercised; the
  household is resolved from the credential (operator cookie or device token).

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite frontend-only dev server |
| `npm run build` | `tsc -b` (typecheck SPA + Functions) then `vite build` |
| `npm run pages:dev` | Full-stack: serves `dist/` + Functions + local D1 |
| `npm test` | Vitest: whenparse, AI graceful-degrade, calm-tenet schema guard |
| `npm run db:migrate:local` / `:prod` | Apply D1 migrations |

## Stack

React 19 + Vite (SPA) → Cloudflare Pages. Pages Functions for `/api/*`, D1 for
state, Workers AI for the capture router. Mirrors the
[marc-portal](../portal) stack so patterns carry over and it can slot into the
portal showcase. No state lib, no CSS framework — boring tech on purpose.
