import { badRequest, readJson, serverError } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { requirePassword } from '../../_lib/sudo'
import { hashPassword } from '../../_lib/password'
import { revokeAllSessionsStatement, sessionCookies, signInAs } from '../../_lib/auth'

// POST /api/auth/password { current, next } — « Changer mon mot de passe » (STATE.md
// §4-L, L1 + L12).
//
// Until this endpoint, the ONLY way to change a password was the emailed reset — a
// signed-in operator on a deployment without mail wired had no way at all. Same
// validation as signup (8 characters); the current password is checked through
// sudo.ts (it IS the sudo door for this action); the new hash and the session_version
// bump (0134) land in ONE batch so every other device is signed out with the change
// — the whole reason anyone changes a password — and this device's cookie is
// re-issued at the new version in the same response.
//
// Operator-only; SILENT in realtime; write-rule ALLOWED on the client with the reason
// (a queued password change replayed later would replace whatever was set since).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ current?: string; next?: string }>(ctx.request)
  const next = body?.next ?? ''
  if (next.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const denied = await requirePassword(ctx.env, actor, body?.current)
  if (denied) return denied
  const email = actor.email!
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE operators SET password_hash = ? WHERE email = ?').bind(await hashPassword(next), email),
    revokeAllSessionsStatement(ctx.env, email),
  ])
  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}, 'operator')
