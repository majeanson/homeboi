import type { Env } from './env'
import type { Actor } from './household'
import { forbidden, badRequest } from './json'
import { safeEqual, verifyPassword } from './password'

// The irreversible doors ask for the password (STATE.md §4-L, item L5).
//
// A wall tablet is often signed in as the operator (STATE.md's idle row says so), and a
// personal phone is left on a counter. A session cookie therefore proves "someone in
// this house", not "the account's owner" — which is fine for adding a supper and wrong
// for revoking the other parent, ending every session, restoring a backup over the
// live content, or (Wave 4) deleting the household. Those doors re-ask the one thing a
// cookie does not carry.
//
// Verification mirrors login exactly (functions/api/auth/login.ts): a signup-era row
// checks ITS hash; a legacy row (no hash — created before self-serve signup existed)
// checks the shared LOGIN_PASSWORD, constant-time; a legacy row on a deployment with
// no LOGIN_PASSWORD set has no password to ask for and passes (that deployment chose
// open login; a sudo door cannot be stricter than its front door).
//
// Returns null when the password is right, else the Response to send back. The
// caller charges the attempt against the rate limiter (L2) BEFORE calling this, so
// the door is not a password oracle.
export async function requirePassword(env: Env, actor: Actor, password: unknown): Promise<Response | null> {
  if (actor.scope !== 'operator' || !actor.email) return forbidden('Cette action demande le compte, pas une tablette.')
  if (typeof password !== 'string' || !password) return badRequest('Mot de passe requis.')
  const row = await env.DB.prepare('SELECT password_hash FROM operators WHERE email = ?')
    .bind(actor.email)
    .first<{ password_hash: string | null }>()
  if (!row) return forbidden('Mot de passe invalide.')
  if (row.password_hash) {
    return (await verifyPassword(password, row.password_hash)) ? null : forbidden('Mot de passe invalide.')
  }
  const required = env.LOGIN_PASSWORD
  if (required && !safeEqual(password, required)) return forbidden('Mot de passe invalide.')
  return null
}
