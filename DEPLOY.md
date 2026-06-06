# Deploying Babillard (Cloudflare Workers)

Babillard runs as **one Cloudflare Worker with static assets**:

- the built SPA in `dist/` is served by the `[assets]` binding;
- `worker/index.ts` handles every `/api/*` request, routing it to the handlers
  under `functions/api/` (unchanged Pages-Functions code, adapted at runtime);
- state lives in **D1**, the one AI feature uses **Workers AI**, and family
  photos/avatars use **R2**.

Deploy command is `npm run deploy` (build + `wrangler deploy`). Live URL ends up
`https://babillard.<account>.workers.dev`.

| Binding | Resource | Required? | If absent |
| --- | --- | --- | --- |
| `DB` | D1 database `babillard` | **Yes** | app can't store anything |
| `SESSION_SECRET` | secret (≥32 chars) | **Yes** for login/devices | auth can't sign/verify |
| `ASSETS` | static `dist/` | **Yes** (auto) | no SPA |
| `AI` | Workers AI | optional | capture → manual type-picker; recap hidden |
| `PHOTOS` | R2 bucket `babillard-photos` | optional | photo/avatar features hide |
| `LOGIN_PASSWORD` | secret | optional | login is open (fine on a trusted LAN) |

## One-time setup

```sh
# 0. Authenticate wrangler against your Cloudflare account
npx wrangler login

# 1. D1 — create the database, then paste the printed id into wrangler.toml
#    ([[d1_databases]] → database_id). A fresh account needs its own id.
npx wrangler d1 create babillard

# 2. Schema — apply every migration (0001 … 0009) to the remote DB
npm run db:migrate:prod        # = wrangler d1 migrations apply babillard --remote

# 3. R2 (optional — enables photos/avatars)
npx wrangler r2 bucket create babillard-photos

# 4. Secrets
npx wrangler secret put SESSION_SECRET     # paste ≥32 random chars
npx wrangler secret put LOGIN_PASSWORD     # optional shared login password

# 5. Workers AI needs no setup — the [ai] binding is available on deploy.
```

## Deploy

```sh
npm run deploy        # tsc -b && vite build && wrangler deploy
```

### Continuous deploys (Workers Builds)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Builds) with:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`

Pushing to the connected branch then builds `dist/` and uploads the Worker —
the same flow used by the sibling `D2Game` project, just with bindings.

## Local development

```sh
# Full stack on http://127.0.0.1:8787 (serves the SPA + runs the Worker + API).
npm run db:migrate:local      # first time / after a new migration
npm run cf:dev                # = wrangler dev  (local D1, optional .dev.vars)

# OR: fast frontend loop with HMR on http://127.0.0.1:5173, /api proxied to the
# wrangler instance above (run cf:dev in another terminal first).
npm run dev
```

Local secrets/vars go in `.dev.vars` (git-ignored — see `.dev.vars.example`).
Without `wrangler login`, the `AI` binding is unavailable locally and the capture
bar/recap take their graceful-degrade paths; everything else works.

## Notes

- **Migrations are forward-only and filename-locked** (`functions/db/migrations/`).
  Never rename one once applied; add a new numbered file instead.
- The `database_id` checked into `wrangler.toml` is the original author's DB. On a
  fresh account, replace it with the id from step 1 (or the deploy will target the
  wrong database / fail).
- Routing is explicit in `worker/routes.ts`. A **new `/api/...` endpoint** needs
  both its handler file under `functions/api/` **and** an entry in that table.
