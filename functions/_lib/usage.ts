import type { Env } from './env'
import { localDayStart, nowSec } from './ids'
import { currentHousehold } from './tz'

// THE DAILY SPEND BOUND (STATE.md §4-K Wave 5, migration 0137).
//
// Two things in this app cost money per use — Workers AI calls and R2 upload bytes — and
// until now nothing bounded either one per household. That was survivable while the only
// household was Marc's. It stopped being survivable the moment a stranger could mint a
// demo sandbox, because a sandbox is a REAL operator session: one unauthenticated POST
// buys a credential that every AI endpoint accepts, and `/api/transcribe` takes 16 MB of
// audio per call.
//
// EVERY HOUSEHOLD IS CAPPED, not only the sandboxes, and that was a deliberate call. The
// narrow reading of the plan was « bound the demo » — but a runaway loop or a bug in a
// real household has no ceiling either, and the household ceiling is set where a family
// will never meet it. The same code path protects the owner from an accident and the
// deployment from a stranger; a sandbox-only cap protects only the second.
//
// WHY A TABLE AND NOT THE RATE-LIMIT BINDINGS. `_lib/rateLimit.ts` is a flood bound:
// short fixed windows, counted per colo, and its own comment says it is « a bound, not an
// accounting system ». It stops a burst and is blind to an hour of patient use. A daily
// budget needs a counter that remembers, which is what 0137 is.
//
// The day is a `localDayStart()` in the HOUSEHOLD's zone (0135, ambient via `_lib/tz`),
// so the counter turns over at the family's midnight rather than at UTC's.

/** Calls to Workers AI per local day. */
export const AI_CALLS_PER_DAY = {
  // A whole afternoon of genuine trying: capture, a few questions, a recipe photo or
  // two, a voice memo. Past this a sandbox is not a visitor any more.
  sandbox: 60,
  // A household would have to use every AI door in the app, all day, to approach this.
  // It is a runaway-loop ceiling, not a rationing of normal use — if anyone ever hits
  // it legitimately, raising it is a one-line decision made with evidence.
  household: 1_000,
} as const

/** R2 upload bytes per local day. Per-REQUEST caps already exist at every call site
 *  (`uploadR2Media`'s `maxBytes`); this is the aggregate the per-request ones cannot see. */
export const UPLOAD_BYTES_PER_DAY = {
  sandbox: 50 * 1024 * 1024,
  household: 2 * 1024 * 1024 * 1024,
} as const

export type Meter = 'ai' | 'upload'

export interface UsageVerdict {
  /** False → the caller must refuse, with 429 and a calm sentence. */
  allowed: boolean
  /** What the household has spent today INCLUDING this charge. */
  used: number
  limit: number
}

/**
 * Charge `amount` against today's budget and say whether it was within it.
 *
 * CHARGE-THEN-CHECK, not check-then-charge, and the difference matters under
 * concurrency: two simultaneous requests that both read « 59 of 60 » would both proceed.
 * The UPSERT below is a single statement, so the increment is atomic and the second
 * caller sees 61 and is refused. The cost of that ordering is that a REFUSED call still
 * counts — deliberately: it makes the bound impossible to walk past by racing it, and
 * the counter resets at the household's own midnight anyway.
 *
 * FAILS OPEN. A counter that cannot be read must not take the household's AI down with
 * it: D1 is a required binding, so if this query is failing the app has larger problems
 * than an uncapped model call. The failure is logged rather than swallowed.
 *
 * Outside a request (the nightly cron, a unit test) there is no household in scope and
 * nothing is charged — the cron's own work is not a visitor's spend.
 */
export async function charge(env: Env, meter: Meter, amount = 1): Promise<UsageVerdict> {
  const who = currentHousehold()
  const limits = meter === 'ai' ? AI_CALLS_PER_DAY : UPLOAD_BYTES_PER_DAY
  const limit = who?.sandbox ? limits.sandbox : limits.household
  if (!who) return { allowed: true, used: 0, limit }

  const now = nowSec()
  const day = localDayStart(new Date(now * 1000))
  const ai = meter === 'ai' ? amount : 0
  const bytes = meter === 'upload' ? amount : 0
  try {
    const row = await env.DB.prepare(
      `INSERT INTO usage_daily (household_id, day, ai_calls, upload_bytes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(household_id, day) DO UPDATE SET
         ai_calls = ai_calls + excluded.ai_calls,
         upload_bytes = upload_bytes + excluded.upload_bytes,
         updated_at = excluded.updated_at
       RETURNING ai_calls, upload_bytes`,
    )
      .bind(who.householdId, day, ai, bytes, now, now)
      .first<{ ai_calls: number; upload_bytes: number }>()
    const used = meter === 'ai' ? (row?.ai_calls ?? 0) : (row?.upload_bytes ?? 0)
    return { allowed: used <= limit, used, limit }
  } catch (err) {
    console.error('[usage]', meter, err)
    return { allowed: true, used: 0, limit }
  }
}

/** Today's counters for one household — for a future Réglages panel, and for the
 *  real-runtime tests, which should read what the app wrote rather than trust it. */
export async function usageToday(env: Env, householdId: string): Promise<{ ai: number; bytes: number }> {
  const day = localDayStart(new Date(nowSec() * 1000))
  const row = await env.DB.prepare('SELECT ai_calls, upload_bytes FROM usage_daily WHERE household_id = ? AND day = ?')
    .bind(householdId, day)
    .first<{ ai_calls: number; upload_bytes: number }>()
  return { ai: row?.ai_calls ?? 0, bytes: row?.upload_bytes ?? 0 }
}
