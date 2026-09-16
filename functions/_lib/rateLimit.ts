import type { Env } from './env'

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
