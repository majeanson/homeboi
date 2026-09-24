import type { Env } from '../../_lib/env'
import { badRequest, conflict, forbidden, readJson, serverError, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { inviteAccepted } from '../../_lib/signupGate'
import { newId, nowSec } from '../../_lib/ids'
import { sendVerification } from '../../_lib/verify'
import { mailEnabled } from '../../_lib/mail'

// Self-serve signup: a new family creates its household + operator account in
// one step (name the household, pick email + password) and lands signed in —
// on an EMPTY board and the WelcomeCard's three steps, because it came here to set
// up its own family. The Tremblay examples used to be seeded here unconditionally,
// so every real household began by shovelling out somebody else's; since 2026-09-23
// they live in the demo sandbox (« Essayer pour vrai », keepable with « Garder ma
// maisonnée ») and behind one opt-in tap (« Charger des exemples », /api/seed).
//
// Who may sign up is _lib/signupGate.ts: SIGNUP_OPEN = "1" (wrangler.toml) opens it
// to anyone; otherwise LOGIN_PASSWORD, when set, is the INVITE CODE; neither = open
// (local dev / LAN). The demo claim asks the same question through the same module.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // Per-address bound (_lib/rateLimit.ts): a signup seeds a whole household, and the
  // 409 below is the one answer that says an address exists — six a minute is a
  // stranger's typo budget, not a harvest (STATE.md §4-L L10 has the rest).
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ email?: string; password?: string; householdName?: string; invite?: string }>(
    ctx.request,
  )
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const name = body?.householdName?.trim().slice(0, 60)
  if (!name) return badRequest('Nom de la maisonnée requis.')

  if (!inviteAccepted(ctx.env, body?.invite)) return forbidden('Code d’invitation invalide.')

  const existing = await ctx.env.DB.prepare('SELECT email FROM operators WHERE email = ?').bind(email).first()
  if (existing) return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')

  const householdId = newId()
  const ts = nowSec()
  try {
    // Atomic batch; operators.email is the primary key, so two racing signups
    // for the same email can't both land — the loser surfaces as a conflict.
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        'INSERT INTO households (id, name, tier, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(householdId, name, 'free', 'active', ts, ts),
      // `verified_at` (0138): stamped NOW when this deployment cannot send mail at all,
      // NULL when it can. Not a shortcut — it is the same judgement the migration made
      // when it backfilled the existing accounts: an address that CANNOT be checked is
      // as confirmed as it will ever be, and leaving it NULL would mean every account
      // created before mail was wired silently loses two doors the day it is.
      ctx.env.DB.prepare(
        'INSERT INTO operators (email, household_id, created_at, password_hash, verified_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(email, householdId, ts, await hashPassword(password), mailEnabled(ctx.env) ? null : ts),
    ])
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  // « Confirme ton courriel » (0138). Best-effort by contract — an account whose letter
  // was lost is recoverable from Réglages; a signup that 500s because mail hiccuped is
  // not. When mail is unwired nothing is sent and nothing gates (see _lib/verify).
  try {
    await sendVerification(ctx.env, email, new URL(ctx.request.url).origin)
  } catch (err) {
    console.error('[mail] verify signup', err)
  }

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 201, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
