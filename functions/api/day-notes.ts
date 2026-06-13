import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, newId, nowSec } from '../_lib/ids'
import { profileMemberId } from '../_lib/profile'

// Day notes — a free-text memo pinned to ONE day of the meal week (see migration
// 0028). Distinct from fridge notes (functions/api/notes.ts), which are
// household-level and transient: a day note belongs to a calendar day and rides
// under it in La cuisine, then surfaces on the Aujourd'hui board for today. One
// memo per day — POST upserts it, DELETE clears it.
//
//   GET    /api/day-notes  -> { notes: [{ id, date, text, member_id, updated_at }] }  (today forward)
//   POST   /api/day-notes  -> upsert { date, text }
//   DELETE /api/day-notes  -> clear  { date }

export const onRequestGet = authed(async (ctx, actor) => {
  // Today forward only — past memos are noise; the kitchen window never looks back.
  const today = localDayStart(new Date(Date.now()))
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, date, text, member_id, updated_at FROM day_notes WHERE household_id = ? AND date >= ? ORDER BY date',
  )
    .bind(actor.householdId, today)
    .all()
  return ok({ notes: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ date?: number; text?: string }>(ctx.request)
  const text = body?.text?.trim()
  if (typeof body?.date !== 'number' || !text) return badRequest('date + texte requis.')
  const date = localDayStart(new Date(body.date * 1000))
  const ts = nowSec()
  // One memo per day: upsert on the unique (household_id, date) index so two
  // devices editing the same day can't double-insert — the later write wins.
  await ctx.env.DB.prepare(
    `INSERT INTO day_notes (id, household_id, date, text, member_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(household_id, date)
       DO UPDATE SET text = excluded.text, member_id = excluded.member_id, updated_at = excluded.updated_at`,
  )
    .bind(newId(), actor.householdId, date, text.slice(0, 280), profileMemberId(ctx.request), ts, ts)
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ date?: number }>(ctx.request)
  if (typeof body?.date !== 'number') return badRequest('date requise.')
  const date = localDayStart(new Date(body.date * 1000))
  await ctx.env.DB.prepare('DELETE FROM day_notes WHERE household_id = ? AND date = ?')
    .bind(actor.householdId, date)
    .run()
  return ok({ ok: true })
})
