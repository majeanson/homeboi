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
- **The service worker precaches entries independently** (`Promise.allSettled` +
  `cache.add`, not atomic `addAll`): one renamed/missing public asset can't abort the
  whole shell precache and leave the JS bundle uncached on a first install.

Covered by `e2e/offline-boot.spec.ts` (hung open + unavailable open → app still mounts)
and `e2e/sw.spec.ts` (shell reboots offline).

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
idempotency key makes creates safe too. Genuinely online-only writes (AI capture,
voice, photo upload, pairing, auth) are **not** queued — disable them offline with
`useOnline()` and an `t.offline.unavailable` hint (see `VoiceButton`/`AddSheet`).

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

**Deliberately NOT queued — online-only** (disable via `useOnline()` + an
`t.offline.unavailable` hint, or just left as direct `api()`): AI capture / voice
/ recipe vision-import-draft / meal-staples / suggest / recap, photo + avatar +
recipe-image uploads (Blob bodies), pairing, auth, the **postal save** (reads the
server-normalized value back), and **recipe-tags** (uses the `useOptimisticMutation`
wrapper). These need a live server round-trip, so queueing them adds no value.

## Known limitations

- **Temp-id chains:** if you add a row offline and then act on it (e.g. check it)
  before reconnecting, the follow-up op targets the `tmp-…` id and is dropped on
  replay (the create gets a real server id). Adding then editing the same item
  while offline is the only case; it self-heals on the next poll.
- **Brief flicker on reconnect:** the live poll and the outbox replay both fire on
  reconnect; an optimistically-added row can blink out and back as the real one
  lands. Self-corrects within one poll.
- Persisted cache and outbox are wiped on any `401` so a revoked device leaves no
  household data on disk.

## Testing

- `functions/_lib/idempotency.test.ts` — replay dedup, non-2xx stays retryable,
  per-household scoping.
- **e2e** (`npm run e2e`): `offline-outbox.spec.ts` — a `/liste` write made offline
  queues (offline-bar pending count, nothing on the wire) then replays on the `online`
  event; `capture-offline.spec.ts` — an offline capture surfaces a failure and keeps the
  typed text (the one write that can't queue, since it needs a live AI round-trip).
- **e2e** (`npm run e2e:sw`, own build+preview harness): `sw.spec.ts` — the service
  worker precaches the shell and reboots offline (the SW is a build artifact, so it needs
  the PROD bundle, not the dev server).
- Manual: `npm run cf:dev`, DevTools → Network "Offline" → check an item / mark a
  chore done (optimistic + banner count) → reload offline (state persists) → go
  online (outbox replays, rows persist) → repeat an action offline twice (no
  duplicate). Confirm the mic + capture bar read as disabled offline.
