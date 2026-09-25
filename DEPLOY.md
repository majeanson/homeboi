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
`https://babillard.<account>.workers.dev`, plus the custom domain in `wrangler.toml`
(`babillard.marcportal.com`).

> **Both hostnames matter, and not only as spare tyres.** The custom domain sits on a
> Cloudflare **zone**, so the zone's WAF / bot protection runs in front of the Worker
> there; `*.workers.dev` does not. A browser never notices the difference — it solves a
> managed challenge and moves on. **A bare `fetch` from a datacenter IP cannot**, and
> that is exactly what CI's « expédiée » callback is: on 2026-09-22 it came back
> `HTTP 403` with a « Just a moment… » interstitial, from the edge, without the Worker
> ever being asked. The same request answers `401` from a laptop, so the shared-secret
> gate was never the problem.
>
> **Machine-to-machine calls into the app therefore use the `*.workers.dev` host**
> (`.github/workflows/ci.yml`, which reads the URL out of the deploy's own output rather
> than hard-coding a subdomain). They carry their own credential — `X-Deploy-Secret`,
> fail-closed — which is the boundary for those routes by design. Everything a HUMAN
> touches stays on the custom domain, behind the zone.

| Binding          | Resource                     | Required?                 | If absent                                        |
| ---------------- | ---------------------------- | ------------------------- | ------------------------------------------------ |
| `DB`             | D1 database `babillard`      | **Yes**                   | app can't store anything                         |
| `SESSION_SECRET` | secret (≥32 chars)           | **Yes** for login/devices | auth can't sign/verify                           |
| `ASSETS`         | static `dist/`               | **Yes** (auto)            | no SPA                                           |
| `AI`             | Workers AI                   | optional                  | capture → manual type-picker; recap hidden       |
| `PHOTOS`         | R2 bucket `babillard-photos` | optional                  | photo/avatar/voice-clip/step-photo features hide |
| `REALTIME_HUB`   | Durable Object `RealtimeHub` | optional                  | `/api/live` → 503; clients fall back to polling  |
| `INVITE_CODE`    | secret                       | optional                  | signup asks no invite code (fine on a trusted LAN). Was `LOGIN_PASSWORD` until 2026-09-25 — nothing reads that name any more |
| `SIGNUP_OPEN`    | var in `wrangler.toml`       | optional                  | `"1"` = anyone may sign up; otherwise `INVITE_CODE` is asked for (`_lib/signupGate.ts`) |
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
npx wrangler secret put INVITE_CODE        # optional: the signup invite code (only read while SIGNUP_OPEN != "1")
npx wrangler secret put MISTRAL_API_KEY    # optional: high-accuracy cloud recipe OCR
npx wrangler secret put ALERT_EMAIL        # optional: where the nightly cron mails when a backup
                                           #   fails or a stale sandbox survives the sweep (+ a
                                           #   Monday « Babillard va bien »); needs RESEND_API_KEY
                                           #   + MAIL_FROM too. Réglages ▸ État des services shows it.
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

## Restaurer une copie (backup → household)

The nightly cron (`functions/_lib/nightly.ts`, the `[triggers]` cron in
`wrangler.toml`) writes one JSON per household to R2 — `backup/<householdId>/<date>.json`,
the same dump `/api/takeout` hands out — and keeps the newest 14. Putting one back:

- **In the app** (the normal way): Réglages ▸ Système ▸ Appareils & accès ▸ « Emporter
  mes données » ▸ **« Restaurer une copie »**. Pick a nightly date, or « Depuis un
  fichier… » for a JSON the household exported itself. It asks for the operator
  password, and the confirm names what is lost.
- **What it replaces**: the household's CONTENT. Paired devices, guest links, shares,
  pairing codes and the operator accounts are NOT touched — a restore puts back what the
  household holds, never who may open it (`functions/_lib/restore.ts`, `CONTENT_TABLES`
  = the sandbox sweep's tables minus takeout's own exclusions, so the two cannot drift).
- **Ids** are kept when nothing collides (a same-household restore keeps the device
  preferences that remember a face) and ALL remapped, soft references included, when the
  dump came from a household that still exists.
- **If it fails mid-way** the household can be half-restored: run the same restore again
  (it wipes first). The R2 copy is never modified by a restore.
- **R2 media** (photos, drawings, voice memos) is referenced by key, not copied: a
  same-household restore finds its blobs where they were.

**The rehearsal runs on every push** — `worker/restore.d1.test.ts` (in `npm run test:d1`,
CI) restores a real household from its own dump against a real D1 + R2 and asserts the
result is byte-for-byte what it was, restores one household's dump into another and
checks every id was remapped, and restores from an actual nightly copy the cron wrote.

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
