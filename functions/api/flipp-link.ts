import { ok, badRequest, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { seal } from '../_lib/secretBox'
import { verifyFlippToken, type FlippLinkRow } from '../_lib/flippAccount'

// « LIER FLIPP » — store (or drop) the household's Flipp session so the server can
// write deals with their clipping straight into the Flipp app (migration 0124,
// STATE.md). Operator-only: holding a credential to a third-party account is not a
// kiosk's to grant. The token arrives from the bookmark, which harvested Flipp's own
// `flipp-login` cookie on flipp.com and carried it to Babillard in a URL hash (Babillard
// is first-party there — a cross-origin POST could not carry the session); the client
// confirms, then POSTs here.

interface LinkRow extends FlippLinkRow {
  created_at: number
  updated_at: number
  last_push_at: number | null
  last_error: string | null
}

async function readLink(env: { DB: D1Database }, householdId: string): Promise<LinkRow | null> {
  return env.DB.prepare('SELECT * FROM flipp_links WHERE household_id = ?').bind(householdId).first<LinkRow>()
}

// GET — the Réglages card's status: linked email, when it last worked, last error.
// Never returns the token (encrypted or not).
export const onRequestGet = authed(async (ctx, actor) => {
  const row = await readLink(ctx.env, actor.householdId)
  if (!row) return ok({ linked: false })
  return ok({ linked: true, email: row.email, lastPushAt: row.last_push_at, lastError: row.last_error })
}, 'operator')

// POST — link: verify the harvested token owns the user id, then store it encrypted.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = (await readJson(ctx.request)) as { userId?: unknown; token?: unknown; email?: unknown } | null
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!userId || !token) return badRequest('Session Flipp incomplète — relance le signet sur flipp.com, connecté.')

  // Prove the token before we keep it: one GET it owns. A stale/wrong token never
  // gets stored, so the card never shows "linked" for a credential that can't write.
  const check = await verifyFlippToken(userId, token)
  if (!check.ok) return badRequest('Flipp a refusé cette session — reconnecte-toi sur flipp.com, puis relance le signet.')

  const enc = await seal(token, ctx.env.SESSION_SECRET)
  const email = typeof body?.email === 'string' ? body.email.slice(0, 200) : check.email
  const now = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO flipp_links (household_id, flipp_user_id, access_token_enc, list_id, email, created_at, updated_at, last_push_at, last_error)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL)
     ON CONFLICT(household_id) DO UPDATE SET
       flipp_user_id = excluded.flipp_user_id,
       access_token_enc = excluded.access_token_enc,
       email = excluded.email,
       updated_at = excluded.updated_at,
       last_error = NULL`,
  )
    .bind(actor.householdId, userId, enc, email, now, now)
    .run()
  return ok({ linked: true, email })
}, 'operator')

// DELETE — « Délier »: the credential is gone. Nothing else to clean up (the list
// lives in Flipp).
export const onRequestDelete = authed(async (ctx, actor) => {
  await ctx.env.DB.prepare('DELETE FROM flipp_links WHERE household_id = ?').bind(actor.householdId).run()
  return ok({ linked: false })
}, 'operator')
