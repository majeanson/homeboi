import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, tooManyRequests, unauthorized } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { verifyPassword } from '../../_lib/password'

// Login: ONE account shape — the row's own password_hash, verified. Until 2026-09-25
// there was a second: a LEGACY row (no hash — created by the first-login path before
// /api/auth/signup existed) opened with the shared LOGIN_PASSWORD. Production was
// counted that day: zero such rows, every account has its own hash. So a row without a
// hash is refused here whatever is typed; its way back in is « Mot de passe oublié »
// (auth/forgot → auth/reset), which SETS a hash. The secret's other job, the signup
// invite code, lives on as INVITE_CODE (_lib/signupGate.ts) — one name, one meaning.
// An unknown email is REFUSED. It used to be a third shape — « first login creates the
// household », gated only by that shared secret — which made login a second signup door
// that never asked the invite question the day the secret's two meanings were split
// (2026-09-24): with it unset, anyone could mint a passwordless household here. /signup
// has been the only door new families are shown. Same answer as a wrong password, so
// this door says nothing about which emails exist.
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

  // No row and no hash answer alike: neither is a password to check.
  if (!row?.password_hash) return unauthorized('Mot de passe invalide.')
  if (!(await verifyPassword(password, row.password_hash))) return unauthorized('Mot de passe invalide.')

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
