import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, tooManyRequests, unauthorized } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { safeEqual, verifyPassword } from '../../_lib/password'

// Login, two account shapes behind one form:
//   1. Signup-era account (password_hash set) → verify THEIR password.
//   2. Legacy account (no hash — created before /api/auth/signup existed) →
//      the shared LOGIN_PASSWORD gate, exactly as before.
// An unknown email is REFUSED. It used to be a third shape — « first login creates the
// household », gated only by LOGIN_PASSWORD — which made login a second signup door
// that never asked the invite question the day the two meanings of LOGIN_PASSWORD
// were split (_lib/signupGate.ts, 2026-09-24): with it unset, anyone could mint a
// passwordless household here. /signup has been the only door new families are shown.
// Same answer as a wrong password, so this door says nothing about which emails exist.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // The address bound first (a flood is refused before the body is even read); the
  // per-email bound once there is an email to guess at. Both before any lookup or
  // hashing (_lib/rateLimit.ts).
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest('Courriel invalide.')
  }
  if (await overAuthLimit(ctx.env, ctx.request, `login:${email}`)) return tooManyRequests()
  const password = body?.password ?? ''

  const row = await ctx.env.DB.prepare('SELECT password_hash FROM operators WHERE email = ?')
    .bind(email)
    .first<{ password_hash: string | null }>()

  if (!row) return unauthorized('Mot de passe invalide.')
  if (row.password_hash) {
    if (!(await verifyPassword(password, row.password_hash))) return unauthorized('Mot de passe invalide.')
  } else {
    // Legacy: the shared secret, constant-time. Unset = open login (local dev / LAN)
    // — which is why production keeps LOGIN_PASSWORD set even with signup open.
    const required = ctx.env.LOGIN_PASSWORD
    if (required && !safeEqual(password, required)) {
      return unauthorized('Mot de passe invalide.')
    }
  }

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
