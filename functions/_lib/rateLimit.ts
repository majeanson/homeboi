import type { Env } from './env'
import { localDayStart, nowSec, sha256Hex } from './ids'
import { DEFAULT_TZ } from './tz'

// The brute-force bound on the unauthenticated doors (STATE.md §4-L, item L2).
//
// Until 2026-09-16 nothing bounded attempts on login, signup, forgot, reset, the demo
// mint, pairing or the invite redeem: PBKDF2 at 100 000 iterations is a fine hash and
// no defence at all against a script trying a list. Two Workers RATE-LIMIT bindings
// (wrangler.toml `[[ratelimits]]`) hold the line — no table, no sweep, no CPU:
//
//   LIMIT_IP   30 / 60 s  keyed by the caller's address — the flood bound
//   LIMIT_KEY   6 / 60 s  keyed by what is being guessed AT (an email, a sudo door)
//                         — the per-target bound, which an attacker with many
//                         addresses would otherwise sidestep
//
// The platform documents this API as permissive, eventually consistent and per-colo:
// a bound on brute force, not an accounting system. That is exactly the job. Both
// bindings are OPTIONAL in Env like AI / PHOTOS: unset means allow, so local dev and
// the unit tests need no binding — and because "unset" would be a silent hole in
// production, /api/health reports `rateLimit` and rateLimit.test.ts pins that
// wrangler.toml declares both names.
//
// Over the limit → 429 + Retry-After: 60 (json.ts tooManyRequests), and the auth
// pages show one calm sentence. A binding that THROWS (a platform hiccup) is treated
// as "allow": the door must not lock on the limiter's bad day.

export type LimitScope = 'ip' | 'key'

export function clientIp(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare's edge on every request; absent only in
  // unit tests and some local harnesses, where every caller shares one bucket.
  return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

// True when THIS attempt is over the limit (and has been counted). One call per
// attempt, before any lookup or hashing, so a rejected attempt costs nothing.
export async function overLimit(env: Env, scope: LimitScope, key: string): Promise<boolean> {
  const binding = scope === 'ip' ? env.LIMIT_IP : env.LIMIT_KEY
  if (!binding) return false
  try {
    const { success } = await binding.limit({ key: `${scope}:${key}` })
    return !success
  } catch {
    return false
  }
}

// The common shape: "this request's address, and optionally the target it names".
// Returns true when EITHER bound is exceeded. Charging the ip first and the key
// second is deliberate: a flood from one address never reaches the per-target count.
export async function overAuthLimit(env: Env, request: Request, targetKey?: string | null): Promise<boolean> {
  if (await overLimit(env, 'ip', clientIp(request))) return true
  if (targetKey && (await overLimit(env, 'key', targetKey))) return true
  return false
}

// Both bindings present: what /api/health reports as `rateLimit`.
export function rateLimitEnabled(env: Env): boolean {
  return !!env.LIMIT_IP && !!env.LIMIT_KEY
}

// THE DAILY HALF (review 2026-11-17, P0 #6; migration 0159). The bindings above stop a
// burst and forget it a minute later; this remembers a day. One atomic UPSERT per door,
// keyed by a salted hash of the caller's address (never the address). FAILS OPEN: a
// counter that cannot count must not cost a real visitor their account.
export type IpDailyEvent = 'account' | 'demo'
export const IP_DAILY_CAP: Readonly<Record<IpDailyEvent, number>> = {
  // A family signs up once, a co-parent joins once. Five covers a shared address (a
  // school, an office NAT) with room to spare.
  account: 5,
  // A visitor who closes the tab and comes back mints another; twenty is a lot of afternoons.
  demo: 20,
}

export async function overIpDailyCap(env: Env, request: Request, event: IpDailyEvent, now = nowSec()): Promise<boolean> {
  try {
    const ipHash = await sha256Hex(`${clientIp(request)}|${env.SESSION_SECRET ?? ''}`)
    const row = await env.DB.prepare(
      `INSERT INTO ip_daily (ip_hash, day, event, n, updated_at) VALUES (?1, ?2, ?3, 1, ?4)
       ON CONFLICT(ip_hash, day, event) DO UPDATE SET n = n + 1, updated_at = excluded.updated_at
       RETURNING n`,
    )
      .bind(ipHash, localDayStart(new Date(now * 1000), DEFAULT_TZ), event, now)
      .first<{ n: number }>()
    return (row?.n ?? 0) > IP_DAILY_CAP[event]
  } catch (err) {
    console.error('[ip-daily]', event, err)
    return false
  }
}

/** The nightly prune: yesterday is the oldest day anyone asks about. */
export async function pruneIpDaily(env: Env, now = nowSec()): Promise<void> {
  await env.DB.prepare('DELETE FROM ip_daily WHERE day < ?').bind(now - 2 * 86_400).run()
}
