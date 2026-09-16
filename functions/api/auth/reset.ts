// POST /api/auth/reset { token, password } — the other half of « Mot de passe oublié ».
//
// The token from the email, hashed and matched against an UNUSED, UNEXPIRED row; the
// password gets signup-grade validation (auth/signup: 8 characters); the operator's
// hash is replaced and the row is marked used in ONE batch (D1 runs it as a
// transaction — a reset can never half-happen); then the person is signed in, exactly
// as signup does, so the next screen is the board and not a login form asking for the
// password they just typed.
//
// A bad, spent or expired token is ONE answer (400): saying which would let someone
// probe. CSRF-exempt like signup (no session yet).
import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { revokeAllSessionsStatement, sessionCookies, signInAs } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { nowSec, sha256Hex } from '../../_lib/ids'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ token?: string; password?: string }>(ctx.request)
  const token = body?.token?.trim() ?? ''
  const password = body?.password ?? ''
  if (!token) return badRequest('Lien invalide.')
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')

  const now = nowSec()
  const row = await ctx.env.DB.prepare(
    'SELECT id, email FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(await sha256Hex(token), now)
    .first<{ id: string; email: string }>()
  if (!row) return badRequest('Ce lien ne fonctionne plus.')
  const op = await ctx.env.DB.prepare('SELECT email FROM operators WHERE email = ?').bind(row.email).first()
  if (!op) return badRequest('Ce lien ne fonctionne plus.')

  // The hash, the row's used_at AND the session_version bump (0134) land in ONE
  // batch: a reset that replaced the password but left the old phone signed in would
  // be half a reset. Then signInAs() mints THIS device's cookie at the new version.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE operators SET password_hash = ? WHERE email = ?').bind(await hashPassword(password), row.email),
    revokeAllSessionsStatement(ctx.env, row.email),
    ctx.env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').bind(now, row.id),
  ])

  try {
    const { session, csrf } = await signInAs(ctx.env, row.email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email: row.email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
