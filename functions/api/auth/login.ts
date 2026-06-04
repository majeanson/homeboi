import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError } from '../../_lib/json'
import { issueSession, sessionCookies } from '../../_lib/auth'
import { ensureHouseholdForEmail } from '../../_lib/household'

// PROTOTYPE login: email only, no password / magic link. First login creates
// the household. Production would swap this for the portal's magic-link flow
// (Resend), but that needs email infra the prototype doesn't stand up. The
// HMAC cookie + CSRF machinery is already real, so the upgrade is local.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await readJson<{ email?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest('Courriel invalide.')
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
