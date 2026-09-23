// POST /api/auth/verify { token } — redeem an email-verification link (0138).
// POST /api/auth/verify?resend — re-send one to the signed-in operator.
//
// CSRF-exempt, like the other two doors a link in an email can open (`auth/reset`,
// `auth/forgot`): the click may land in a browser that has never met this app, so there
// is no cookie pair to double-submit. The token IS the credential, it is single-use, and
// it grants exactly one thing — a `verified_at` stamp. Nothing else is reachable with it.
//
// Not a household write: SILENT in realtime, and no outbox (replaying « verify me » from
// a queue hours later is the same category of wrong as replaying a password reset).
import type { Env } from '../../_lib/env'
import { badRequest, forbidden, ok, readJson, serviceUnavailable, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { mailEnabled } from '../../_lib/mail'
import { resolveActor } from '../../_lib/household'
import { redeemVerification, sendVerification } from '../../_lib/verify'

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)

  // ── The resend door. Signed in, because it re-sends to the address on the ACCOUNT
  // and never to an address the caller names — a resend that took a parameter would be
  // a way to make this app mail a stranger.
  if (url.searchParams.has('resend')) {
    if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché sur ce Babillard.')
    const actor = await resolveActor(ctx.env, ctx.request).catch(() => null)
    if (!actor?.email || actor.scope !== 'operator') return forbidden('Cette action demande le compte.')
    if (await overAuthLimit(ctx.env, ctx.request, `verify:${actor.email}`)) return tooManyRequests()
    const sent = await sendVerification(ctx.env, actor.email, url.origin).catch((err) => {
      console.error('[mail] verify resend', err)
      return false
    })
    // `sent: false` is not an error the person can act on — it means mail is unwired or
    // three links are already in flight. The UI says the same calm sentence either way.
    return ok({ sent })
  }

  // ── The redeem door.
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ token?: string }>(ctx.request)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return badRequest('Lien invalide.')
  const email = await redeemVerification(ctx.env, token)
  if (!email) return badRequest('Ce lien a déjà servi, ou il est expiré. Réglages peut en renvoyer un.')
  return ok({ ok: true, email })
}
