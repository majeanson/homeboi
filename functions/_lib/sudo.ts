import type { Env } from './env'
import type { Actor } from './household'
import { forbidden, badRequest, tooManyRequests } from './json'
import { overLimit } from './rateLimit'
import { verifyPassword } from './password'

// The irreversible doors ask for the password (STATE.md §4-L, item L5).
//
// A wall tablet is often signed in as the operator (STATE.md's idle row says so), and a
// personal phone is left on a counter. A session cookie therefore proves "someone in
// this house", not "the account's owner" — which is fine for adding a supper and wrong
// for revoking the other parent, ending every session, restoring a backup over the
// live content, or (Wave 4) deleting the household. Those doors re-ask the one thing a
// cookie does not carry.
//
// Verification mirrors login exactly (functions/api/auth/login.ts): the row's OWN hash,
// nothing else. A row without one (the legacy shape — it used to check the shared
// LOGIN_PASSWORD, and PASSED when that was unset; retired 2026-09-25 once production
// counted zero such rows) has nothing to compare and is refused: a password door with
// no password behind it is not a door. « Mot de passe oublié » gives it a hash.
//
// Returns null when the password is right, else the Response to send back. Every
// attempt is charged against the per-target rate limit (L2, `sudo:<email>`) before
// the hash is checked, so the door is not a password oracle.
export async function requirePassword(env: Env, actor: Actor, password: unknown): Promise<Response | null> {
  if (actor.scope !== 'operator' || !actor.email) return forbidden('Cette action demande le compte, pas une tablette.')
  if (typeof password !== 'string' || !password) return badRequest('Mot de passe requis.')
  if (await overLimit(env, 'key', `sudo:${actor.email}`)) return tooManyRequests()
  const row = await env.DB.prepare('SELECT password_hash FROM operators WHERE email = ?')
    .bind(actor.email)
    .first<{ password_hash: string | null }>()
  if (!row?.password_hash) return forbidden('Mot de passe invalide.')
  return (await verifyPassword(password, row.password_hash)) ? null : forbidden('Mot de passe invalide.')
}

// The second lock on the doors that take EVERYTHING — leaving (DELETE /api/household)
// and starting over (POST /api/household/reset): the household's NAME, retyped. The
// password is something the owner knows by heart and can type while thinking about
// something else; the name has to be read off the screen. Compared with accents and
// case folded away — the name is displayed right above the field, and « Chez Nous » vs
// « chez nous » is a typing accident, not a different household.
//
// Returns null when it matches, else the Response to send back.
export async function requireHouseholdName(env: Env, householdId: string, typed: unknown): Promise<Response | null> {
  const row = await env.DB.prepare('SELECT name FROM households WHERE id = ?').bind(householdId).first<{ name: string }>()
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  if (!row?.name || typeof typed !== 'string' || fold(typed) !== fold(row.name)) {
    return badRequest('Le nom de la maisonnée ne correspond pas.')
  }
  return null
}
