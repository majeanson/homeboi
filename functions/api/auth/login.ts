import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, unauthorized } from '../../_lib/json'
import { issueSession, sessionCookies } from '../../_lib/auth'
import { ensureHouseholdForEmail } from '../../_lib/household'

// Login: email + an optional shared password (LOGIN_PASSWORD). First login
// creates the household. This is a household-owned deployment, not a SaaS — one
// shared secret, no per-user password store. A full magic-link flow (Resend)
// would be the SaaS upgrade, but needs email infra; the HMAC cookie + CSRF
// machinery underneath is already real, so that swap stays local.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await readJson<{ email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return badRequest('Courriel invalide.')
  }

  // When a password is configured, it must match. Constant-time so the shared
  // secret can't be guessed by timing. Unset = open login (local dev / LAN).
  const required = ctx.env.LOGIN_PASSWORD
  if (required && !safeEqual(body?.password ?? '', required)) {
    return unauthorized('Mot de passe invalide.')
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

// Length-aware constant-time string compare (the length difference can leak, but
// the secret's bytes don't). Good enough for a single shared deployment secret.
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}
