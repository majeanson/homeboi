import { ok, badRequest, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// The AI error journal (migration 0029). Three thin operations on one household-
// scoped table:
//   POST   — acknowledge a failure into the log (the on-screen "Accepter" button).
//            Any actor: the notice can pop on a kiosk a toddler is using, and we
//            still want it recorded for the operator to read later.
//   GET    — list the log, newest first, for the Réglages journal.
//   DELETE — clear the whole log (operator-only — it's the "I've read it" reset).
//
// Deliberately tiny: no counts surfaced, no severity, nothing to optimize against
// (NFR-CALM). It's a maintenance log that empties when you clear it.

const FEATURE_MAX = 80
const MESSAGE_MAX = 500
const LIST_MAX = 100

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ feature?: string; message?: string }>(ctx.request)
  const feature = body?.feature?.trim().slice(0, FEATURE_MAX)
  const message = body?.message?.trim().slice(0, MESSAGE_MAX)
  if (!feature || !message) return badRequest('feature + message requis.')

  await ctx.env.DB.prepare(
    'INSERT INTO ai_errors (id, household_id, feature, message, profile, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), actor.householdId, feature, message, profileMemberId(ctx.request), nowSec())
    .run()
  return ok()
})

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    'SELECT id, feature, message, created_at FROM ai_errors WHERE household_id = ? ORDER BY created_at DESC LIMIT ?',
  )
    .bind(actor.householdId, LIST_MAX)
    .all<{ id: string; feature: string; message: string; created_at: number }>()
  return ok({ errors: rows.results })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  await ctx.env.DB.prepare('DELETE FROM ai_errors WHERE household_id = ?').bind(actor.householdId).run()
  return ok()
}, 'operator')
