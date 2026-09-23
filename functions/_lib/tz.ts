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

// The store carries the zone AND who is asking, for the same reason and by the same
// argument: `_lib/usage.ts` has to charge a day's AI call to a household from inside
// `_lib/ai.ts`, whose eleven model calls sit behind pure functions that take `env` and
// never an `Actor`. Threading one through them (and through their callers) is the same
// 190-call-site edit this file exists to avoid — so the request says who it is, once,
// where it already says what time it is.
interface RequestContext {
  tz?: string
  /** Absent outside a request — the cron, a unit test, the module top level. */
  householdId?: string
  /** A throwaway demo household, which gets the tight daily caps (_lib/usage.ts). */
  sandbox?: boolean
}

const store = new AsyncLocalStorage<RequestContext>()

/** Run `fn` with this request's household context (authed() does this per request). */
export function runWithRequest<T>(ctx: RequestContext, fn: () => T): T {
  return ctx.tz || ctx.householdId ? store.run(ctx, fn) : fn()
}

/** Run `fn` with `tz` as the ambient household zone. Kept for the tz-only callers. */
export function runWithTz<T>(tz: string | undefined, fn: () => T): T {
  return runWithRequest({ tz }, fn)
}

/** The zone for THIS request, or America/Toronto outside one. */
export function currentTz(): string {
  return store.getStore()?.tz ?? DEFAULT_TZ
}

/** Who this request belongs to — `null` outside a request, which is a real case
 *  (the nightly cron) and never an error: the caller decides what that means. */
export function currentHousehold(): { householdId: string; sandbox: boolean } | null {
  const s = store.getStore()
  return s?.householdId ? { householdId: s.householdId, sandbox: !!s.sandbox } : null
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
