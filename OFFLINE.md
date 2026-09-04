# Offline & PWA resilience

Babillard is built for a cheap always-on wall tablet, so it has to survive flaky
wifi, power blips, and being installed as a home-screen PWA (NFR-OFFLINE-1). This
is the map of how that works — read it before touching the cache, the write path,
or anything online/offline-aware.

## The four layers

| Layer | What it does | Where |
| --- | --- | --- |
| **App shell + images** | Service worker precaches the built shell (hashed assets + public files) and caches images cache-first, so the app boots and pictures show offline. | `vite.config.ts` (`swSource`) → emits `dist/sw.js` at build time |
| **Data (read)** | The TanStack Query cache is persisted to IndexedDB and restored **before first paint**, so a cold reboot shows the last-known board, lists and recipes — not an empty shell. | `src/lib/persist.ts`, wired in `src/main.tsx` |
| **Data (write)** | Writes made offline are queued in IndexedDB and **replayed on reconnect**, deduped server-side by an idempotency key so a replay never double-applies. | `src/lib/outbox.ts` + `src/lib/write.ts` (client), `functions/_lib/idempotency.ts` + `0039_idempotency.sql` (server) |
| **Awareness** | A calm "Hors ligne" banner with a "Données du …" freshness stamp + pending-write count; online-only controls disable themselves. | `src/lib/online.ts`, `src/components/OfflineBanner.tsx` |

## Boot must never block on IndexedDB (NFR-OFFLINE-1)

The single hardest offline rule: **the app must mount even when storage is broken.**
A reported bug had an installed iOS PWA open offline to an all-black screen — the
shell HTML + theme loaded (the service worker served them), but React never mounted,
leaving an empty `#root` over the dark shell. Cause: the boot in `src/main.tsx`
`await`ed `restorePersistedCache()` (an IndexedDB read) *before* `createRoot().render()`,
and on iOS a fresh-launch `indexedDB.open()` can **hang with no `success`/`error`/
`blocked` event ever firing** (a WebKit bug, worse offline where nothing nudges it) —
so `render()` never ran.

Rules that keep it fixed:

- **`main.tsx` caps the pre-paint restore** (`Promise.race` vs a ~1.5s timeout) and
  mounts regardless. A healthy device restores in ~a frame and paints with data; a
  stuck one paints the shell after the cap and the snapshot hydrates *late* into the
  already-mounted queries (they re-render when it lands). Restore is best-effort — it
  must never gate first paint.
- **Every `indexedDB.open()` self-bounds** (`persist.ts`, `outbox.ts`): settle once on
  `success`/`error`/**`onblocked`** and a ~3s timeout, so a hung/blocked open resolves
  `null` instead of leaving a dangling promise. `open()` throwing (private mode) is
  caught → `null`. A `null` db degrades to "no persistence," never a hang.
- **The service worker precaches in TWO tiers** — and only one of them tolerates a
  failure. `PRECACHE_OPTIONAL` (public/ files) stays best-effort (`allSettled`), so a
  renamed icon can never take the shell down. `PRECACHE_CRITICAL` (the shell entry +
  this build's hashed bundles) is **all-or-nothing with a retry** (`cacheOne(…, 3)`):
  "they always exist for this build" is a BUILD-time fact, not a runtime one — the
  fetch can still blip — and swallowing that used to activate a worker around a shell
  with a hole in it, invisible until the tablet next rebooted offline. If a critical
  entry still won't land, install FAILS, which is the safe outcome: the browser
  retries later and the previous worker keeps serving.
  *(This bullet used to describe the old `allSettled` + `cache.add` behaviour for BOTH
  tiers — that is exactly the tolerance that was removed.)*

Covered by `e2e/offline-boot.spec.ts` (hung open + unavailable open → app still mounts)
and `e2e/sw.spec.ts` (shell reboots offline).

## What the snapshot keeps (two rules, both learned the hard way)

The snapshot can only ever save **what is still in the Query cache, with data** at
save time — and two defaults quietly violated that (2026-09-03: airplane-mode test
reopened on a Board and a Liste that were empty shells while La cuisine was fine):

- **`gcTime` is a day, not TanStack's 5-minute default** (`lib/query.ts`). Ten
  minutes spent on one tab garbage-collected every other tab's inactive queries,
  and the next debounced save wrote a snapshot *without them* — offline reopen
  then had nothing to restore for those tabs. Only an ephemeral surface may opt
  back into a short `gcTime` per-query (`TodayChangesSheet`'s `gcTime: 0`).
- **Dehydrate keeps every query that HOLDS DATA, not `status === 'success'`**
  (`persist.ts`). A failed poll flips a query to `'error'` while its last good
  data stays in the cache; filtering on status meant the act of going offline
  *erased* the open tab from the snapshot within seconds. `dehydrate` only
  serializes the data frame, so data-bearing errored queries are safe to keep.

## The write path (outbox)

`useWrite()` (`src/lib/write.ts`) is the offline-aware replacement for the old
`api(…,{method}).catch().finally(invalidate)` pattern. For each write it:

1. applies the **optimistic** cache change immediately (offline creates use a
   `tmp-…` id so the row shows at once);
2. sends it online via `api()`, **or** — when offline or on a transport failure —
   enqueues it to the outbox and resolves a `{queued:true}` sentinel (no throw);
3. invalidates the `affectedKeys` so the live poll reconciles.

A real **server** rejection (`ApiError`, i.e. the server was reachable and said no)
is **not** queued — it rethrows; the invalidate refetch corrects the optimistic
guess. Only transport/offline failures queue.

The outbox replays FIFO on `online` / tab-focus / startup. Each replay sends the
stored `Idempotency-Key`; `authed()` → `withIdempotency()` returns the stored 2xx
response for a key it has already seen, so replays are safe. A `4xx` on replay is
treated as moot (row gone/forbidden) and dropped — the live poll reconciles; `5xx`/
network stops the run to retry later; `401` clears the outbox via the auth-lost path.

### Adding a new write

Use `const write = useWrite()` and call
`write(path, { method, body, affectedKeys, optimistic })` instead of `api()`.
Idempotent writes (toggles, deletes-by-id, field sets) replay safely as-is; the
idempotency key makes creates safe too. Genuinely online-only writes (voice,
photo upload, pairing, auth) are **not** queued — disable them offline with
`useOnline()` and an `t.offline.unavailable` hint (see `VoiceButton`). The typed
**capture** (＋ button) is queued too (A-2, bmad/10, below) — only the routing
happens later; a raw AI round-trip like `useAi()`'s meal-suggest stays online-only.

## Migration status

All data writes go through `useWrite()` / `writeWith()`:

- **List:** `Liste`, `QuickAddPage`, `ListEditPage`.
- **Board:** chore/to-do/leftover done, dismiss note (`Board`, `board/Notes`).
- **Kitchen:** `DayPlanPage`, `Leftovers`, `MealIdeas`, `mealMutations`,
  `useMealPlanning`, `PantryTab`, `ReserveSection`.
- **Forms / recipes / deals:** `EventForm`, `ChoreForm`, `RoutineForm`,
  `RecipeSheet`, `lib/picks`.
- **Operator settings:** members add/edit/delete, chore/routine/event delete,
  routine time-of-day, store-include toggle, list-history, réserve locations.
- **Capture (A-2, bmad/10):** `AddSheet`'s quick-capture form (the ＋ button's typed
  path). Offline/transport-failure enqueues the **raw text** to the same
  `/api/capture` endpoint for replay — the AI routing + `parseWhen` still run
  server-side, just later, once the device reconnects. `{queued:true}` clears the
  box and shows a calm confirmation instead of the routed/undo UI (there's nothing
  routed yet). `VoiceButton` (Web Speech needs a live connection) stays online-only.

**Deliberately NOT queued — online-only** (disable via `useOnline()` + an
`t.offline.unavailable` hint, or just left as direct `api()`): voice capture / recipe
vision-import-draft / suggest / recap, photo + avatar +
recipe-image uploads (Blob bodies), pairing, auth, the **postal save** (reads the
server-normalized value back), and **recipe-tags** (uses the `useOptimisticMutation`
wrapper). These need a live server round-trip, so queueing them adds no value.

## The two service-worker cache traps

Both are cheap to reintroduce and both fail the same way — a wall tablet reboots
to a blank board — so they are written down rather than left to be rediscovered.
The SW lives in `vite.config.ts` (`babillard-sw`, emitted as `dist/sw.js`).

1. **HTML under a subresource URL (the grey-screen bug).** The origin serves the
   SPA with `not_found_handling = "single-page-application"`, so a request for a
   hashed chunk that no longer exists does NOT 404 — it answers **200 text/html**
   with `index.html`. `res.ok` is true, so a naive cache-first handler writes HTML
   under a `.js` URL, and being cache-first that entry then wins forever: the entry
   module parses as HTML, React never mounts, blank page on every reload, online or
   off. Guarded in two places — `cacheOne()` refuses to WRITE it at install, and the
   fetch handler refuses to SERVE it (`isHtml && !wantsHtml` → 504 `Stale asset`,
   plus it drops the cached shell so the next navigation must fetch fresh HTML).

2. **Variant-sensitive lookups — the blank-board bug (diagnosed 2026-08-26).**
   `cacheOne()` stores with `c.put(url, res)` — a bare **string** URL — so the stored
   Request carries no headers, while every lookup passes the browser's real Request.
   The preview/origin sends **`Vary: Origin`** on assets; a `<script type="module">`
   is fetched with CORS semantics and sends an `Origin` header, the stored request
   does not, so the Cache Query algorithm compares them, differs, and reports **no
   match for an entry that is right there**. Offline that means the SW falls through
   to `fetch()`, answers its own 504, and `#root` stays empty: a wall tablet
   rebooting to a blank board. Every `caches.match` in the SW therefore passes
   **`{ ignoreVary: true }`** — correct rather than a workaround, since this SW keeps
   exactly ONE variant per URL and never content-negotiates.

   *Why it took three tries to name.* It failed ~50% on the Linux runner and never on
   Windows (where the same lookup hits regardless — see `hitWithoutIgnoreVary` in the
   log line below), so it read as a flake, and was twice treated as one — once by
   widening a timeout that then failed at the wider value. The first property test used
   `Vary: Accept-Encoding`, a **forbidden header name** added below the Cache API and
   therefore absent from both sides of the comparison: the wrong header made a true
   hypothesis look false, and the fix was wrongly labelled "hardening". What settled it
   was reading the stored response's headers on the runner where the failure lived
   (`[sw] entry module as stored` — logged on every run of `e2e/sw.spec.ts`) and then
   20/20 green from the on-demand **SW offline repro** workflow, against ~50% before.

   Guards: the property test in `e2e/sw.spec.ts` (a `Vary: Origin` response must still
   be served offline), that always-on header log, and `.github/workflows/sw-repro.yml`
   to force the coin flip on demand. Note `scripts/check-bundle.mjs` cannot catch this
   class of bug: it proves an entry is in the precache LIST, not that it is retrievable
   by a real request.

## Known limitations

- **Temp-id chains — FIXED (bmad/08 E-41, 2026-07-07):** adding a row offline and
  then acting on it (check/edit/delete) before reconnecting used to drop the
  follow-up on replay (it targeted the `tmp-…` id). Now a queued create carries its
  `tmpId` (`WriteSpec.tmpId`, threaded from the tmp-row call sites — Liste add,
  todos add); when the create replays, the outbox extracts the real id from the
  response (`extractCreatedId` — top-level `{id}` or one nested level) and rewrites
  every later queued op that still references the tmp id (path + body,
  `rewriteTmpId`), persisting the rewrite so a mid-replay interruption keeps it.
  *Residual edge:* acting on the tmp row in the moment BETWEEN its create landing
  and the invalidate refetch swapping the row still targets a stale id — one poll
  self-heals, as before. A new tmp-row create site must pass `tmpId` to keep its
  chain safe.
- **Brief flicker on reconnect:** the live poll and the outbox replay both fire on
  reconnect; an optimistically-added row can blink out and back as the real one
  lands. Self-corrects within one poll.
- Persisted cache and outbox are wiped on any `401` so a revoked device leaves no
  household data on disk.
- **Google Fonts on a first offline boot:** the `fonts.googleapis.com/css2`
  stylesheet is cached as-it-is-fetched, never precached (cross-origin), so a
  tablet that has never loaded it online 504s on it offline. Harmless by
  construction — that handler resolves a real (degraded) Response rather than
  leaving `respondWith` rejected, so nothing hangs, and type falls back to the
  stack. Seen in the CI diagnostics beside the real failure; not the cause of it.

## Testing

- `functions/_lib/idempotency.test.ts` — replay dedup, non-2xx stays retryable,
  per-household scoping.
- `src/lib/outbox.test.ts` — the E-41 temp-id chain helpers (`extractCreatedId`
  response shapes; `rewriteTmpId` body/array/path rewrites, identity on no-match).
- **e2e** (`npm run e2e`): `offline-outbox.spec.ts` — a `/liste` write made offline
  queues (offline-bar pending count, nothing on the wire) then replays on the `online`
  event; `capture-offline.spec.ts` — an offline capture shows the queued confirmation,
  clears the box, bumps the pending count, sends nothing on the wire, then replays
  with an `Idempotency-Key` header on reconnect.
- **e2e** (`npm run e2e:sw`, own build+preview harness): `sw.spec.ts` — the service
  worker precaches the shell and reboots offline (the SW is a build artifact, so it needs
  the PROD bundle, not the dev server).
- Manual: `npm run cf:dev`, DevTools → Network "Offline" → check an item / mark a
  chore done (optimistic + banner count) → reload offline (state persists) → go
  online (outbox replays, rows persist) → repeat an action offline twice (no
  duplicate). Confirm the mic reads as disabled offline, and a typed capture shows
  the queued confirmation instead of a failure.
