import { safeEqual } from './password'

// THE ONLY INBOUND SHARED-SECRET GATE IN THIS CODEBASE.
//
// It guards POST /api/remarks/shipped, which GitHub Actions calls AFTER a successful
// deploy of main to mark a remark « expédiée » with the commit that fixed it. No browser
// is involved, so there is no cookie and nothing for CSRF to protect; this secret is the
// whole authorization.
//
// KEPT PURE — no env, no Request — so its POLARITY is unit-testable in `npm test`
// without a Worker. That matters because you cannot unbind a variable per-test in
// vitest.d1.config.ts, and the polarity is the single most dangerous line here.
//
// ── THE POLARITY IS INVERTED FROM INVITE_CODE, ON PURPOSE ─────────────────────────
// functions/_lib/signupGate.ts reads:
//     inviteRequired = !signupOpen(env) && !!env.INVITE_CODE
// i.e. UNSET ⇒ the gate is OPEN. That is right THERE: the invite code is an optional
// extra lock on a door (signup) that already validates a password of its own, and unset
// means "local dev". (Until 2026-09-25 that secret was LOGIN_PASSWORD and login.ts had
// the same shape, `required && !safeEqual(…)`, for legacy rows.) Here the same shape
// would be a hole. An unset secret on an unauthenticated WRITE endpoint reachable from
// the open internet must CLOSE the door, not remove it. If you ever find yourself copying
// the signup-gate shape into this file, you are deleting the only lock on it.
//
// ── A SHORT SECRET IS AN UNSET SECRET ─────────────────────────────────────────────
// auth.ts refuses a SESSION_SECRET under 32 chars rather than signing with a weak key.
// Same stance. The rate limiter bounds guessing, which is not a defence against a short
// secret and was never meant to be.
//
// ── '' IS A REAL VALUE, AND IT IS THE TRAP ────────────────────────────────────────
// `!secret` and NOT `secret === undefined`, deliberately: wrangler hands a Worker '' for
// a declared-but-empty var, vitest.d1.config.ts binds INVITE_CODE: '' exactly that
// way, and **safeEqual('', '') is TRUE**. An `=== undefined` check would leave this
// endpoint open to anyone who sends `X-Deploy-Secret:` with nothing after the colon.
// deployHook.test.ts holds that case specifically.

export const DEPLOY_HEADER = 'X-Deploy-Secret'

/** Shortest secret we will act on. Below this, the deployment reads as unconfigured. */
export const DEPLOY_SECRET_MIN = 32

export type DeployGate = 'unconfigured' | 'denied' | 'ok'

export function checkDeploySecret(secret: string | undefined | null, presented: string | null): DeployGate {
  if (!secret || secret.length < DEPLOY_SECRET_MIN) return 'unconfigured'
  if (!presented) return 'denied'
  // Constant-time (functions/_lib/password.ts). The LENGTH can leak; the bytes cannot.
  // Never `===` here — and a source-reading guard in deployHook.test.ts says so, because
  // no behavioural test can tell the two apart.
  return safeEqual(presented, secret) ? 'ok' : 'denied'
}

/** What /api/health reports as `deployHook`. A gate whose unset state is invisible is a
 *  gate nobody notices has fallen shut — the same argument rateLimit and alerts make. */
export function deployHookEnabled(env: { DEPLOY_NOTIFY_SECRET?: string }): boolean {
  return checkDeploySecret(env.DEPLOY_NOTIFY_SECRET, 'x') !== 'unconfigured'
}
