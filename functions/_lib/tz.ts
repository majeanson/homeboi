import { AsyncLocalStorage } from 'node:async_hooks'

// THE HOUSEHOLD'S TIME ZONE, as per-request ambient context (STATE.md §4-L, item L11).
//
// Every day boundary in this app runs through the helpers in `ids.ts`
// (`localDayStart`, `addLocalDays`, `localTimeOnDay`, `localDayOfWeek`), and each took
// `tz = 'America/Toronto'` as a default argument. About 190 call sites never pass one —
// across 40 files, most of them deep inside pure modules (recur, upkeep, whenparse,
// transfers) whose own callers would each have needed a new parameter too. Threading a
// tz through all of that is a large mechanical edit across the app's entire date layer,
// which is the one area this repo has been bitten by twice (DST, the fixed-86400 trap).
//
// So the zone is not threaded: it is ESTABLISHED ONCE PER REQUEST, in `authed()`, and
// the helpers read it as their default. Every existing call site becomes correct with no
// edit, and a new one cannot forget to pass something it never has to pass.
//
// AsyncLocalStorage, not a module-level variable, and the difference is the whole point:
// one isolate serves many concurrent requests, so a mutable module variable would leak
// one household's zone into another's response — exactly the kind of cross-tenant bug
// worker/isolation.d1.test.ts exists to catch. ALS gives each request its own store and
// carries it across awaits (proven in the real runtime before this was written).
//
// Outside a request — the nightly cron, a unit test, the module top level — there is no
// store and `currentTz()` answers the default, which is what those callers meant.

const DEFAULT_TZ = 'America/Toronto'

const store = new AsyncLocalStorage<{ tz: string }>()

/** Run `fn` with `tz` as the ambient household zone (authed() does this per request). */
export function runWithTz<T>(tz: string | undefined, fn: () => T): T {
  return tz ? store.run({ tz }, fn) : fn()
}

/** The zone for THIS request, or America/Toronto outside one. */
export function currentTz(): string {
  return store.getStore()?.tz ?? DEFAULT_TZ
}

// A zone is only usable if Intl knows it — an unknown one makes every date helper throw,
// which would take the whole household down. Validated on write (PATCH /api/household),
// never trusted from the row.
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export { DEFAULT_TZ }
