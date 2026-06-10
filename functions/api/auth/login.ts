import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, unauthorized } from '../../_lib/json'
import { issueSession, sessionCookies } from '../../_lib/auth'
import { ensureHouseholdForEmail } from '../../_lib/household'
import { safeEqual, verifyPassword } from '../../_lib/password'

// Login, three account shapes behind one form:
//   1. Signup-era account (password_hash set) → verify THEIR password.
//   2. Legacy account (no hash — created before /api/auth/signup existed) →
//      the shared LOGIN_PASSWORD gate, exactly as before.
//   3. Unknown email → the original first-login-creates-household path, still
//      gated by LOGIN_PASSWORD when set. Kept so a handed-out shared code keeps
//      working; new families are pointed at /signup by the UI.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await readJson<{ email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest('Courriel invalide.')
  }
  const password = body?.password ?? ''

  const row = await ctx.env.DB.prepare('SELECT password_hash FROM operators WHERE email = ?')
    .bind(email)
    .first<{ password_hash: string | null }>()

  if (row?.password_hash) {
    if (!(await verifyPassword(password, row.password_hash))) return unauthorized('Mot de passe invalide.')
  } else {
    // Legacy/unknown: the shared secret, constant-time. Unset = open login
    // (local dev / LAN).
    const required = ctx.env.LOGIN_PASSWORD
    if (required && !safeEqual(password, required)) {
      return unauthorized('Mot de passe invalide.')
    }
  }

  try {
    await ensureHouseholdForEmail(ctx.env, email)
    const { session, csrf } = await issueSession(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
