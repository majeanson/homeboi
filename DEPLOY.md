# Deploying Babillard (Cloudflare Workers)

Babillard runs as **one Cloudflare Worker with static assets**:

- the built SPA in `dist/` is served by the `[assets]` binding;
- `worker/index.ts` handles every `/api/*` request, routing it to the handlers
  under `functions/api/` (unchanged Pages-Functions code, adapted at runtime) —
  except `GET /api/live`, which it hijacks into a WebSocket upgrade (realtime);
- state lives in **D1**, the one AI feature uses **Workers AI**, family
  photos/avatars (and routine voice clips / recipe step photos) use **R2**, and a
  per-household **Durable Object** (`RealtimeHub`) fans out realtime invalidations.

Deploy command is `npm run deploy` (build + `wrangler deploy`). Live URL ends up
`https://babillard.<account>.workers.dev`.

| Binding          | Resource                     | Required?                 | If absent                                        |
| ---------------- | ---------------------------- | ------------------------- | ------------------------------------------------ |
| `DB`             | D1 database `babillard`      | **Yes**                   | app can't store anything                         |
| `SESSION_SECRET` | secret (≥32 chars)           | **Yes** for login/devices | auth can't sign/verify                           |
| `ASSETS`         | static `dist/`               | **Yes** (auto)            | no SPA                                           |
| `AI`             | Workers AI                   | optional                  | capture → manual type-picker; recap hidden       |
| `PHOTOS`         | R2 bucket `babillard-photos` | optional                  | photo/avatar/voice-clip/step-photo features hide |
| `REALTIME_HUB`   | Durable Object `RealtimeHub` | optional                  | `/api/live` → 503; clients fall back to polling  |
| `LOGIN_PASSWORD` | secret                       | optional                  | login is open (fine on a trusted LAN)            |
| `MISTRAL_API_KEY`| secret (Mistral API key)     | optional                  | high-accuracy cloud recipe OCR hides; on-device read only |

## One-time setup

```sh
# 0. Authenticate wrangler against your Cloudflare account
npx wrangler login

# 1. D1 — create the database, then paste the printed id into wrangler.toml
#    ([[d1_databases]] → database_id). A fresh account needs its own id.
npx wrangler d1 create babillard

# 2. Schema — apply every migration (0001 … 0041 and up) to the remote DB
npm run db:migrate:prod        # = wrangler d1 migrations apply babillard --remote

# 3. R2 (optional — enables photos/avatars)
npx wrangler r2 bucket create babillard-photos

# 4. Secrets
npx wrangler secret put SESSION_SECRET     # paste ≥32 random chars
npx wrangler secret put LOGIN_PASSWORD     # optional shared login password
npx wrangler secret put MISTRAL_API_KEY    # optional: high-accuracy cloud recipe OCR
#   Get a free key at https://console.mistral.ai (free "Experiment" tier, no card).
#   Then in the app: Réglages ▸ Affichage ▸ « Lecture des photos de recette » → Haute précision.

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

## Diffuser au salon (Cast the board to a TV)

A read-only living-room board lives at **`/cast`** — it composes the real `<Board/>`
made passive (`.cast` scope, `pointer-events:none`) and scaled for 10-foot viewing. It
boots with a read-only `showcase` guest token, minted as a link + QR from **Réglages ▸
Affichage ▸ « Diffuser au salon »**. Two ways it reaches the TV:

- **Stage 1 — Cast tab (no setup).** Open the minted `/cast?guest=…` link in **Chrome on
  a computer** → ⋮ → *Cast…* → pick the Chromecast → *Cast tab*. Works today; the
  computer must stay awake while casting. (iOS browsers can't start a cast — Apple
  blocks the sender SDK — so the computer's Chrome is the sender.)
- **Stage 2 — Cast receiver (always-on, no computer running).** `public/cast-receiver.html`
  is a registered **Custom Receiver**: the Chromecast loads it, runs the CAF receiver
  framework (so the session stays alive on the device), and embeds `/cast` in a
  same-origin iframe. A Chrome-only **« Diffuser maintenant »** button (`src/lib/cast.ts`)
  launches it and hands it the token over a custom channel.

**Enabling Stage 2 (one-time, by the household owner):**

1. Create a **Google Cast developer account** at <https://cast.google.com/publish>
   ($5 one-time; the account email can't be changed later).
2. **Add New Application → Custom Receiver.** URL = `https://<your-prod-host>/cast-receiver`
   (HTTPS, required once published — the prod Worker already is). ⚠️ Use the
   **extensionless** path: Cloudflare's asset server 307-redirects `/cast-receiver.html`
   → `/cast-receiver`, and registering the canonical 200 URL avoids relying on the
   receiver following that redirect. Save → note the **Application ID**.
3. **Add New Device** = the Chromecast's *software (Cast)* serial (Google Home app →
   device → settings, or cast the console page to read it). Wait ~15 min, then reboot
   the Chromecast → status **"Ready for Testing."**
4. **Do NOT publish** — an unpublished receiver works privately on your registered
   device(s) indefinitely; publishing is only for worldwide listing. No iOS sender
   fields are needed (the sender is desktop Chrome, the Web platform).
5. Paste the Application ID into **`CAST_APP_ID`** in `src/lib/cast.ts`, then `npm run
   deploy`. The « Diffuser maintenant » button then appears in Chrome; until it's set
   the button stays hidden and Stage 1 (cast-tab) is the path. No CSP blocks the Cast
   SDKs (loaded from `gstatic.com`); the service worker passes them through.

## Notes

- **Migrations are forward-only and filename-locked** (`functions/db/migrations/`).
  Never rename one once applied; add a new numbered file instead.
- The `database_id` checked into `wrangler.toml` is the original author's DB. On a
  fresh account, replace it with the id from step 1 (or the deploy will target the
  wrong database / fail).
- Routing is explicit in `worker/routes.ts`. A **new `/api/...` endpoint** needs
  both its handler file under `functions/api/` **and** an entry in that table.
  (Exception: `/api/live` is intercepted in `worker/index.ts` for the WS upgrade
  and is intentionally NOT in the table.)
- **Realtime (Durable Objects).** `RealtimeHub` (a per-household, SQLite-backed DO
  declared in `wrangler.toml`) pushes `{type:'invalidate', keys}` to connected
  boards so a write on one device refreshes the others without waiting for the
  poll. It's an **optimization layered over polling, which stays the source of
  truth** — if the socket is absent the app is unaffected. Activated in prod
  2026-06-17. **To roll back:** comment out the `[[durable_objects.bindings]]` +
  `[[migrations]]` blocks in `wrangler.toml` and set `REALTIME_ENABLED = false` in
  `src/main.tsx`; `/api/live` then 503s and clients poll. SQLite-backed DOs are
  free-tier eligible (`new_sqlite_classes`); a DO-ineligible account fails the
  deploy on this binding, so confirm with `npx wrangler deploy --dry-run` first.
  WS auth: operators ride the same-origin session cookie; kiosk/guest devices pass
  their token as `?t=<token>` (the browser WebSocket API can't set headers).
  **B-11 (bmad/10) closed the "why is realtime off?" sub-task as already answered:**
  it isn't off — live in prod since `d1d9b67` (2026-06-17), and poll gears already
  relax on connect (`perf(realtime): back off polling when the realtime socket is
  open`). No runtime env var — the rebuild-flag kill-switch above (re-comment the
  wrangler binding + flip `REALTIME_ENABLED`) is intentionally the only lever.
  Coverage: `e2e/realtime.spec.ts` (WS invalidate + SW offline precache).
