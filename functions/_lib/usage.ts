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

// WHO PAYS WHICH CEILING (migration 0139, 2026-09-24). Signup opened that day, and the
// « household » ceiling below had been set for families Marc INVITED. So the ceiling now
// follows TRUST, resolved from the household's operator rows — never from the request:
//   - 'sandbox'    — a demo household (its operator is `demo-…@babillard.invalid`);
//   - 'unverified' — nobody on it has confirmed an email (0138). A stranger who signed
//                    up gets a visitor's ceiling until they click the link;
//   - 'household'  — at least one operator confirmed, or the deployment cannot send mail
//                    at all (0138 stamps those verified: an address that cannot be checked
//                    is as confirmed as it will ever be).
// It is the HOUSEHOLD's trust, not the requester's: a tablet paired to a sandbox has no
// email, and until 0139 it spent at the full household ceiling.
export type Trust = 'sandbox' | 'unverified' | 'household'

/** Calls to Workers AI per local day. */
export const AI_CALLS_PER_DAY = {
  // A whole afternoon of genuine trying: capture, a few questions, a recipe photo or
  // two, a voice memo. Past this a sandbox is not a visitor any more.
  sandbox: 60,
  // The same afternoon, for a stranger who signed up but has not confirmed. Confirming
  // is one click in a letter that has already arrived — the wait is theirs to end.
  unverified: 60,
  // A household would have to use every AI door in the app, all day, to approach this.
  // It is a runaway-loop ceiling, not a rationing of normal use — if anyone ever hits
  // it legitimately, raising it is a one-line decision made with evidence.
  household: 1_000,
} as const satisfies Record<Trust, number>

/** R2 upload bytes per local day. Per-REQUEST caps already exist at every call site
 *  (`uploadR2Media`'s `maxBytes`); this is the aggregate the per-request ones cannot see. */
export const UPLOAD_BYTES_PER_DAY = {
  sandbox: 50 * 1024 * 1024,
  unverified: 50 * 1024 * 1024,
  household: 2 * 1024 * 1024 * 1024,
} as const satisfies Record<Trust, number>

// THE STRANGERS' POOL: one daily ceiling shared by every sandbox and every unverified
// household together. A per-household cap bounds one visitor; nothing bounded a
// thousand of them, and signups are limited only per address. Confirmed households
// never draw from it, so strangers can exhaust it without a family noticing — the
// nightly cron reports the pool and mails when it filled (_lib/nightly.ts).
// Sized at DEMO_SANDBOX_CAP (25) full afternoons: well past a busy day of real visitors.
export const STRANGER_POOL_PER_DAY = {
  ai: 25 * AI_CALLS_PER_DAY.sandbox,
  upload: 25 * UPLOAD_BYTES_PER_DAY.sandbox,
} as const

export type Meter = 'ai' | 'upload'

export interface UsageVerdict {
  /** False → the caller must refuse, with 429 and a calm sentence. */
  allowed: boolean
  /** What the household has spent today INCLUDING this charge. */
  used: number
  limit: number
  /** Whose ceiling applied. Absent outside a request (nothing was charged). */
  trust?: Trust
  /** True when THIS household was within its own ceiling but the strangers' pool was not. */
  pool?: boolean
}

// The trust of the household the UPSERT is charging, as one scalar subquery. An
// aggregate without GROUP BY always yields exactly one row, so a household with no
// operator row at all (it should not exist) reads as 'unverified' — the careful answer.
const TRUST_SQL = `(SELECT CASE
    WHEN MAX(email LIKE 'demo-%@babillard.invalid') = 1 THEN 'sandbox'
    WHEN MAX(verified_at IS NOT NULL) = 1 THEN 'household'
    ELSE 'unverified' END
  FROM operators WHERE household_id = ?1)`

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
 * The household's trust is resolved INSIDE that same statement and stored on the row, so
 * a confirmed family pays no extra query; a stranger pays one more, the pool sum.
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
  if (!who) return { allowed: true, used: 0, limit: limits.household }

  const now = nowSec()
  const day = localDayStart(new Date(now * 1000))
  const ai = meter === 'ai' ? amount : 0
  const bytes = meter === 'upload' ? amount : 0
  try {
    const row = await env.DB.prepare(
      `INSERT INTO usage_daily (household_id, day, ai_calls, upload_bytes, trust, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ${TRUST_SQL}, ?5, ?5)
       ON CONFLICT(household_id, day) DO UPDATE SET
         ai_calls = ai_calls + excluded.ai_calls,
         upload_bytes = upload_bytes + excluded.upload_bytes,
         trust = excluded.trust,
         updated_at = excluded.updated_at
       RETURNING ai_calls, upload_bytes, trust`,
    )
      .bind(who.householdId, day, ai, bytes, now)
      .first<{ ai_calls: number; upload_bytes: number; trust: Trust }>()
    const trust: Trust = row?.trust ?? 'household'
    const limit = limits[trust] ?? limits.household
    const used = meter === 'ai' ? (row?.ai_calls ?? 0) : (row?.upload_bytes ?? 0)
    if (used > limit) return { allowed: false, used, limit, trust }
    if (trust === 'household') return { allowed: true, used, limit, trust }

    // A stranger within their own ceiling: is the shared pool? « Today » across every
    // zone at once is every row whose local day began in the last 24 h — each zone's
    // current day did, and its previous one did not. Includes this charge (it landed).
    const pool = await env.DB.prepare(
      `SELECT COALESCE(SUM(${meter === 'ai' ? 'ai_calls' : 'upload_bytes'}), 0) AS n
       FROM usage_daily WHERE day > ?1 AND trust <> 'household'`,
    )
      .bind(now - 86_400)
      .first<{ n: number }>()
    const poolLimit = meter === 'ai' ? STRANGER_POOL_PER_DAY.ai : STRANGER_POOL_PER_DAY.upload
    if ((pool?.n ?? 0) > poolLimit) return { allowed: false, used, limit, trust, pool: true }
    return { allowed: true, used, limit, trust }
  } catch (err) {
    console.error('[usage]', meter, err)
    return { allowed: true, used: 0, limit: limits.household }
  }
}

/** What strangers (sandboxes + unverified households) spent in the last 24 h, all
 *  households together — the pool's own reading, for the nightly report. */
export async function strangerSpend(env: Env, now = nowSec()): Promise<{ ai: number; bytes: number }> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(ai_calls), 0) AS ai, COALESCE(SUM(upload_bytes), 0) AS bytes
     FROM usage_daily WHERE updated_at > ?1 AND trust <> 'household'`,
  )
    .bind(now - 86_400)
    .first<{ ai: number; bytes: number }>()
  return { ai: row?.ai ?? 0, bytes: row?.bytes ?? 0 }
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
