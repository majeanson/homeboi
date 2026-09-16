// POST /api/auth/forgot { email } — « Mot de passe oublié » (STATE.md §4-K wave 3).
//
// ALWAYS 200 once the input parses, whether or not the email has an account: the
// answer must not tell a stranger which addresses exist. The only non-200s are a
// malformed email (400) and « mail is not wired on this deployment » (503, which the
// client turns into one calm sentence — the door on /login already hides on
// health.mail=false, so this is a belt for the direct URL).
//
// Bounded: at most RESET_MAX_OPEN unexpired, unused tokens per email — past that the
// request still says 200 and sends nothing, so a flood of clicks cannot fill the table
// or the inbox. 30 minutes to live. The token travels ONLY in the email; the row keeps
// its SHA-256 (ids.sha256Hex), so the database holds nothing that opens a door.
//
// CSRF-exempt (worker/index.ts): there is no session yet. Not a household write:
// SILENT in realtime, and the client's write-rule ALLOWED entry says why no outbox
// (replaying « send me a link » hours later is exactly wrong).
import type { Env } from '../../_lib/env'
import { badRequest, ok, readJson, serviceUnavailable } from '../../_lib/json'
import { mailEnabled, sendMail } from '../../_lib/mail'
import { newId, nowSec, sha256Hex } from '../../_lib/ids'

// Module-private: a route module may export nothing but its handlers (worker/routes.ts
// RouteMod), which is also the right shape — nothing else needs these.
const RESET_TTL_SEC = 30 * 60
const RESET_MAX_OPEN = 3

function resetMail(link: string): { subject: string; text: string; html: string } {
  return {
    subject: 'Babillard — un nouveau mot de passe',
    text: `Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Babillard.\n\nOuvre ce lien dans les 30 prochaines minutes pour en choisir un :\n${link}\n\nSi ce n'était pas toi, ignore ce courriel — rien ne change.`,
    html: `<p>Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Babillard.</p><p><a href="${link}">Choisir un nouveau mot de passe</a> — le lien est bon 30 minutes.</p><p>Si ce n'était pas toi, ignore ce courriel : rien ne change.</p>`,
  }
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché sur ce Babillard.')
  const body = await readJson<{ email?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Courriel invalide.')

  const now = nowSec()
  const op = await ctx.env.DB.prepare('SELECT email FROM operators WHERE email = ?').bind(email).first()
  if (!op) return ok()
  const open = await ctx.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM password_resets WHERE email = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(email, now)
    .first<{ n: number }>()
  if ((open?.n ?? 0) >= RESET_MAX_OPEN) return ok()

  const token = newId(32)
  await ctx.env.DB.prepare(
    'INSERT INTO password_resets (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(newId(), await sha256Hex(token), email, now + RESET_TTL_SEC, now)
    .run()

  const link = `${new URL(ctx.request.url).origin}/reinitialiser?t=${encodeURIComponent(token)}`
  try {
    await sendMail(ctx.env, { to: email, ...resetMail(link) })
  } catch (err) {
    // The visitor still hears « if an account exists, a link went out »; the failure
    // (an unverified domain, a bad key) is for the log, which observability keeps.
    console.error('[mail] reset', err)
  }
  return ok()
}
