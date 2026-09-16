import { readJson, serverError } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { requirePassword } from '../../_lib/sudo'
import { revokeAllSessions, sessionCookies, signInAs } from '../../_lib/auth'

// POST /api/auth/sessions/revoke { password } — « Se déconnecter partout ailleurs »
// (STATE.md §4-L, L1 + L12).
//
// Bumps the operator's session_version (migration 0134), which turns every cookie
// minted before now into a 401 on its next request — the lost phone, the browser at
// work, the tablet a relative borrowed. Then re-issues THIS device's cookie at the new
// version in the same response, so the person pressing the button stays exactly where
// they are. Password-gated (sudo.ts): a stolen unlocked phone must not be able to lock
// the owner out of every other device.
//
// Operator-only: a kiosk has no sessions to end (its credential is a device token,
// revoked from the devices card). SILENT in realtime (no polled cache changes);
// write-rule ALLOWED on the client with the reason (an outbox replay of « sign me out
// everywhere » hours later is the wrong moment).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ password?: string }>(ctx.request)
  const denied = await requirePassword(ctx.env, actor, body?.password)
  if (denied) return denied
  await revokeAllSessions(ctx.env, actor.email!)
  try {
    const { session, csrf } = await signInAs(ctx.env, actor.email!)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}, 'operator')

// Nothing to list: sessions are stateless by design (no row per device), so the only
// honest read is « this device is signed in », which auth/me already answers.
