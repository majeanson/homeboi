import type { Env } from '../../_lib/env'
import { badRequest, conflict, forbidden, readJson, serverError } from '../../_lib/json'
import { issueSession, sessionCookies } from '../../_lib/auth'
import { hashPassword, safeEqual } from '../../_lib/password'
import { newId, nowSec } from '../../_lib/ids'
import { seedSampleData } from '../../_lib/sampleData'

// Self-serve signup: a new family creates its household + operator account in
// one step (name the household, pick email + password) and lands signed in.
//
// When LOGIN_PASSWORD is set it doubles as the INVITE CODE here — exactly the
// gate a new household needed before this endpoint existed (first login used to
// require it), so adding signup changes nothing about who can get in. Unset =
// open signup (local dev / LAN / a deliberately public deployment).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await readJson<{ email?: string; password?: string; householdName?: string; invite?: string }>(
    ctx.request,
  )
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const name = body?.householdName?.trim().slice(0, 60)
  if (!name) return badRequest('Nom de la maisonnée requis.')

  const required = ctx.env.LOGIN_PASSWORD
  if (required && !safeEqual(body?.invite ?? '', required)) {
    return forbidden('Code d’invitation invalide.')
  }

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
      ctx.env.DB.prepare(
        'INSERT INTO operators (email, household_id, created_at, password_hash) VALUES (?, ?, ?, ?)',
      ).bind(email, householdId, ts, await hashPassword(password)),
    ])
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  // Seed the demo family so the board is alive on first login (onboarding Phase 1).
  // Best-effort: a seed failure must never fail the signup — the operator can load
  // examples later from Réglages, or just start empty.
  try {
    await seedSampleData(ctx.env, householdId, ts)
  } catch {
    /* non-fatal — an empty household is a valid start */
  }

  try {
    const { session, csrf } = await issueSession(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 201, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
