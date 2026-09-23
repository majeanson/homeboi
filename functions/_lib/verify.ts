import type { Env } from './env'
import type { Actor } from './household'
import { forbidden } from './json'
import { mailEnabled, sendMail } from './mail'
import { newId, nowSec, sha256Hex } from './ids'

// « Ce courriel existe-t-il vraiment ? » — the shared half of email verification
// (migration 0138, STATE.md §4-K Wave 5).
//
// The endpoints own their own HTTP shape; what lives here is the part three of them
// share: minting a link, and the gate.
//
// WHAT VERIFICATION IS FOR, precisely. Not for using the app — an unverified account
// works normally, and gating the front door on a mail round-trip would make signing up
// worse for everyone to catch the rare fake address. It is for the TWO doors that reach
// OUTSIDE the household: inviting a co-operator, and issuing a guest link. Those send
// something to a third party, so an invented address that can issue them is a relay
// rather than an account.

const VERIFY_TTL_SEC = 7 * 24 * 3600
/** Outstanding unexpired links per address. A resend button must not fill an inbox. */
const VERIFY_MAX_OPEN = 3

export function verifyMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: 'Babillard — confirme ton courriel',
    text: `Bienvenue sur Babillard.\n\nConfirme que cette adresse est bien la tienne :\n${link}\n\nLe lien est bon sept jours. Tant qu'il n'est pas ouvert, tout fonctionne — sauf inviter quelqu'un d'autre ou partager un lien d'invité.`,
    html: `<p>Bienvenue sur Babillard.</p><p><a href="${link}">Confirme que cette adresse est bien la tienne</a> — le lien est bon sept jours.</p><p>Tant qu'il n'est pas ouvert, tout fonctionne : sauf inviter quelqu'un d'autre ou partager un lien d'invité.</p>`,
  }
}

/**
 * Mint a verification link for `email` and send it. Best-effort by contract: the caller
 * (signup) must never fail because mail did not go out — an account that exists but
 * whose letter was lost is recoverable from Réglages; a signup that 500s is not.
 *
 * Returns false when nothing was sent, which the resend door reports and signup ignores.
 */
export async function sendVerification(env: Env, email: string, origin: string): Promise<boolean> {
  if (!mailEnabled(env)) return false
  const now = nowSec()
  const open = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM email_verifications WHERE email = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(email, now)
    .first<{ n: number }>()
  if ((open?.n ?? 0) >= VERIFY_MAX_OPEN) return false

  // The token travels ONLY in the email; the row keeps its SHA-256 (0133's rule).
  const token = `${newId()}${newId()}`
  await env.DB.prepare(
    'INSERT INTO email_verifications (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(newId(), await sha256Hex(token), email, now + VERIFY_TTL_SEC, now)
    .run()
  await sendMail(env, { to: email, ...verifyMail(`${origin}/verifier?t=${token}`) })
  return true
}

/** Redeem a token: marks the row used and the operator verified. Returns the email, or
 *  null when the token is unknown, spent or expired — the caller says which sentence. */
export async function redeemVerification(env: Env, token: string): Promise<string | null> {
  const now = nowSec()
  const row = await env.DB.prepare(
    'SELECT id, email FROM email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(await sha256Hex(token), now)
    .first<{ id: string; email: string }>()
  if (!row) return null
  await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').bind(now, row.id),
    env.DB.prepare('UPDATE operators SET verified_at = ? WHERE email = ? AND verified_at IS NULL').bind(now, row.email),
  ])
  return row.email
}

export async function isVerified(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT verified_at FROM operators WHERE email = ?')
    .bind(email)
    .first<{ verified_at: number | null }>()
  return !!row?.verified_at
}

/**
 * THE GATE. Returns the Response to send back, or null to proceed.
 *
 * FAILS OPEN WHEN MAIL IS UNWIRED, deliberately and by the same argument every optional
 * binding here makes (`_lib/env.ts`): a deployment that cannot send a verification link
 * must not lock its operator out of inviting anyone. The gate is only as real as the
 * mail, and pretending otherwise would strand a self-hoster with no way through.
 *
 * A kiosk or an agent never reaches this — those scopes cannot call the two doors it
 * guards — so an actor without an email is one of those, and is not what this is for.
 */
export async function requireVerified(env: Env, actor: Actor): Promise<Response | null> {
  if (!mailEnabled(env)) return null
  if (!actor.email) return null
  if (await isVerified(env, actor.email)) return null
  return forbidden('Confirme d’abord ton courriel — le lien est dans ta boîte, et Réglages peut le renvoyer.')
}
