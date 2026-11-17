import type { Env } from '../../_lib/env'
import { clearSessionCookies, revokeThisSession } from '../../_lib/auth'

// « Se déconnecter »: the cookie this browser held is refused by the server from now on
// (0160, review 2026-11-17 P0 #7) — clearing it alone left a copied cookie valid for its
// thirty days. Best-effort on the server half: if the row cannot be written, the browser
// is still signed out, which is what the person pressing the button sees and asked for.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  await revokeThisSession(ctx.env, ctx.request).catch((err) => console.error('[logout]', err))
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  for (const c of clearSessionCookies()) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
