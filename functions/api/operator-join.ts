import type { Env } from '../_lib/env'
import { badRequest, conflict, forbidden, notFound, ok, readJson, serverError, tooManyRequests } from '../_lib/json'
import { overAuthLimit } from '../_lib/rateLimit'
import { signInAs, sessionCookies, verifyOperatorInvite } from '../_lib/auth'
import { hashPassword } from '../_lib/password'
import { nowSec } from '../_lib/ids'

// « Rejoindre une maisonnée » — redeem an operator invite (see operator-invite.ts and
// migration 0128). This is the endpoint that makes a household able to hold two
// adults, and it is exactly ONE line different from signup: it INSERTs into
// `operators` against an existing household_id instead of creating a household.
//
// That one line is the whole feature, and getting it wrong is the bug it fixes: a
// partner who signs up the ordinary way gets a brand-new household of their own (it
// used to be seeded with the sample family, too). So nothing on this path may create a
// household, and nothing here may seed.
//
//   GET  /api/operator-join?j=<token>  -> { householdName }        (no auth — a preview)
//   POST /api/operator-join { token, email, password }             (no auth — this IS the auth)
//
// CSRF: both are exempt the same way /api/demo is — the caller has no session yet, so
// there is no cookie to double-submit. The capability token is the credential.

interface Checked {
  householdId: string
  name: string
}

// Verify signature + expiry, then check the nonce against the household's LIVE value.
// Both halves matter: the signature proves we minted it, the nonce proves it has not
// been revoked since. A rotated link keeps a perfectly valid signature forever, which
// is why the DB read is not optional.
async function checkInvite(env: Env, token: string | null): Promise<Checked | Response> {
  const payload = await verifyOperatorInvite(env, token)
  if (!payload) return forbidden('Ce lien d’invitation est invalide ou expiré.')
  const row = await env.DB.prepare('SELECT id, name, status, invite_nonce FROM households WHERE id = ?')
    .bind(payload.householdId)
    .first<{ id: string; name: string; status: string | null; invite_nonce: string | null }>()
  if (!row) return notFound('Cette maisonnée n’existe plus.')
  // A rotated (or never-minted) nonce kills the link. Compared as a plain string:
  // these are server-generated ids, not user secrets, and the value is already proven
  // authentic by the HMAC above — a timing-safe compare here would be theatre.
  if (!row.invite_nonce || row.invite_nonce !== payload.nonce) {
    return forbidden('Ce lien d’invitation a été réinitialisé — demande-s’en un nouveau.')
  }
  if (row.status && row.status !== 'active') return forbidden('Cette maisonnée n’accepte pas de nouveaux accès.')
  return { householdId: row.id, name: row.name }
}

// The preview. Someone opening a texted link deserves to see WHOSE household they are
// about to join before they type a password — and a wrong/expired link should say so
// here, not after they have filled a form.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get('j')
  const checked = await checkInvite(ctx.env, token)
  if (checked instanceof Response) return checked
  // The NAME only. Never the members, the email of whoever invited, or anything else
  // about the household: this endpoint is unauthenticated, and a valid-looking link is
  // the only thing standing in front of it.
  return ok({ householdName: checked.name })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ token?: string; email?: string; password?: string }>(ctx.request)
  const checked = await checkInvite(ctx.env, body?.token ?? null)
  if (checked instanceof Response) return checked

  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  // The same 8-character floor as signup and demo/claim. One number, three places —
  // if it ever moves it moves in all three.
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')

  // NO LOGIN_PASSWORD GATE HERE, unlike signup.ts and demo/claim.ts, and that is
  // deliberate rather than forgotten. That shared code gates who may create a NEW
  // household on this deployment. This link is a per-household capability an operator
  // minted and handed to one person; it is the narrower gate of the two, and asking
  // for the deployment code as well would mean a household could not invite anyone
  // without also handing out the key to the whole instance.

  const existing = await ctx.env.DB.prepare('SELECT household_id FROM operators WHERE email = ?')
    .bind(email)
    .first<{ household_id: string }>()
  if (existing) {
    // Already in THIS household: the link was used twice, or two people share an
    // inbox. Not an error worth a scary message — just say it is already done.
    if (existing.household_id === checked.householdId) {
      return conflict('Ce courriel a déjà accès à cette maisonnée — connecte-toi.', 'already-member')
    }
    // Already an operator SOMEWHERE ELSE. Refuse rather than move them: `operators`
    // is keyed on email, so "joining" would rewrite their household_id and orphan
    // every row of their own household — invisible, unrecoverable, and triggered by
    // tapping a link a relative sent. One account, one household (see 0128).
    return conflict(
      'Ce courriel gère déjà une autre maisonnée. Utilise une autre adresse pour rejoindre celle-ci.',
      'other-household',
    )
  }

  try {
    await ctx.env.DB.prepare(
      'INSERT INTO operators (email, household_id, created_at, password_hash) VALUES (?, ?, ?, ?)',
    )
      .bind(email, checked.householdId, nowSec(), await hashPassword(password))
      .run()
  } catch {
    // operators.email is the PRIMARY KEY, so two racing redemptions of the same link
    // with the same address cannot both land — the loser arrives here.
    return conflict('Ce courriel a déjà accès à cette maisonnée — connecte-toi.', 'already-member')
  }

  // NOTHING IS SEEDED. This household already has a real family, and dropping fake
  // kids into it would be the exact confusion this whole feature exists to remove.
  // (Signup no longer seeds either, since 2026-09-23 — the examples are opt-in.)
  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email, householdName: checked.name }), { status: 201, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
