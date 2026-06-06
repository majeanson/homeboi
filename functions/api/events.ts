import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart, newId, nowSec } from '../_lib/ids'
import { normalizeRecur } from '../_lib/recur'

// Events (the agenda the board merges). Until now events could only be born from
// a capture; this is the operator's direct CRUD so a typo can be fixed and a
// cancelled thing removed. GET is open to any actor (the management list); the
// writes are operator-only. The board reads events through /api/board, not here.
//
// An event may RECUR (recur_json: a {freq,interval?,weekdays?} rule). start_at is
// the anchor; the board expands the series. See _lib/recur.
export const onRequestGet = authed(async (ctx, actor) => {
  // Upcoming one-offs (today forward) PLUS every recurring series (whose anchor
  // may be in the past, e.g. "garbage every Wednesday" set weeks ago).
  const today = dayStart(new Date(Date.now()))
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, title, start_at, all_day, member_id, recur_json FROM events
      WHERE household_id = ? AND (recur_json IS NOT NULL OR start_at >= ?)
      ORDER BY start_at LIMIT 100`,
  )
    .bind(actor.householdId, today)
    .all()
  return ok({ events: results })
})

interface EventBody {
  id?: string
  title?: string
  startAt?: number
  allDay?: boolean
  memberId?: string | null
  recur?: unknown // {freq,interval?,weekdays?} or null/absent for a one-off
}

const recurJson = (recur: unknown): string | null => {
  const r = normalizeRecur(recur)
  return r ? JSON.stringify(r) : null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<EventBody>(ctx.request)
  const title = body?.title?.trim()
  if (!title || typeof body?.startAt !== 'number') return badRequest('Titre + date requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO events (id, household_id, member_id, title, start_at, all_day, recur_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      body.memberId ?? null,
      title,
      Math.floor(body.startAt),
      body.allDay ? 1 : 0,
      recurJson(body.recur),
      nowSec(),
    )
    .run()
  return ok({ id, title })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<EventBody>(ctx.request)
  const title = body?.title?.trim()
  if (!body?.id || !title || typeof body?.startAt !== 'number') return badRequest('id + titre + date requis.')
  const res = await ctx.env.DB.prepare(
    'UPDATE events SET title = ?, start_at = ?, all_day = ?, member_id = ?, recur_json = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      title,
      Math.floor(body.startAt),
      body.allDay ? 1 : 0,
      body.memberId ?? null,
      recurJson(body.recur),
      body.id,
      actor.householdId,
    )
    .run()
  if (!res.meta.changes) return notFound('Rendez-vous introuvable.')
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM events WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
