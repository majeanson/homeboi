import type { Env } from './env'
import { safeEqual } from './password'

// Who may CREATE an account — signup (auth/signup.ts) and « Garder ma maisonnée »
// (demo/claim.ts, a signup in disguise). One module so the two doors cannot drift.
//
// Until 2026-09-24 this gate was LOGIN_PASSWORD « doubling as the invite code », and
// that one secret also guarded two other doors: a legacy (no-hash) account's login and
// that same account's sudo lock (_lib/sudo.ts) — so « drop the invite code » read as
// `wrangler secret delete LOGIN_PASSWORD` would have opened signup AND let any password
// into every legacy account. The invite got its own switch that day; on 2026-09-25, with
// production counted at zero legacy rows, the password job was retired outright and the
// secret became INVITE_CODE: one name, one meaning, nothing else reads it.
//
//   - `SIGNUP_OPEN = "1"` (a plain var in wrangler.toml — opening the gate is a commit
//     someone can read, not a dashboard click) → no invite asked, whatever else is set.
//   - otherwise, INVITE_CODE set → it is the invite code.
//   - otherwise → open (local dev / LAN / the d1 harness).
type GateEnv = Pick<Env, 'SIGNUP_OPEN' | 'INVITE_CODE'>

export function signupOpen(env: GateEnv): boolean {
  // Exactly "1". Any other spelling ("true", "yes", " 1") stays closed: a typo in the
  // var must fail toward the gate, never toward the public.
  return env.SIGNUP_OPEN === '1'
}

// Does the signup page need to ask for a code? (/api/health `invite`.)
export function inviteRequired(env: GateEnv): boolean {
  return !signupOpen(env) && !!env.INVITE_CODE
}

// May this request create an account? `presented` is the body's `invite`.
export function inviteAccepted(env: GateEnv, presented: unknown): boolean {
  if (!inviteRequired(env)) return true
  return typeof presented === 'string' && safeEqual(presented, env.INVITE_CODE!)
}
