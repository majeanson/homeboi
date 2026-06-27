import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// « Voyage » → Bagages — per-member packing checklists (migration 0092). member_id
// NULL = the SHARED list; a member id = that person's own list. "Packed" is a mark in
// place (packed_at, like todos.done_at); "Effacer cochées" deletes the checked rows.
// Reuses the todos UI (CheckRow / useDeferredRemoval) but NOT the todos TABLE, so a
// packing item never leaks onto the board glance or the month grid.
//
//   GET    /api/trip-packing?tripId=<id> -> that trip's items (all lists)
//   POST   /api/trip-packing             -> add { tripId, text, member_id? }
//   PATCH  /api/trip-packing             -> { id, packed?, text? } OR bulk { tripId, clearChecked, ids? }
//   DELETE /api/trip-packing             -> remove { id }
//
// Calm: a soft check, never a count / "n of m" / quantity.

interface PackingRow {
  id: string
  trip_id: string
  member_id: string | null
  text: string
  packed_at: number | null
  position: number
  created_at: number
}

const COLS = 'id, trip_id, member_id, text, packed_at, position, created_at'
const TEXT_CAP = 200

export const onRequestGet = authed(async (ctx, actor) => {
  const tripId = new URL(ctx.request.url).searchParams.get('tripId')?.trim()
  if (!tripId) return badRequest('tripId requis.')
  const rows = await ctx.env.DB.prepare(
    `SELECT ${COLS} FROM trip_packing WHERE household_id = ? AND trip_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
  )
    .bind(actor.householdId, tripId)
    .all<PackingRow>()
  return ok({ items: rows.results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ tripId?: string; text?: string; member_id?: string | null }>(ctx.request)
  const tripId = body?.tripId?.trim()
  const text = body?.text?.trim()
  if (!tripId) return badRequest('tripId requis.')
  if (!text) return badRequest('Texte requis.')
  const trip = await ctx.env.DB.prepare('SELECT 1 FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(tripId, actor.householdId)
    .first<{ 1: number }>()
  if (!trip) return notFound('Voyage introuvable.')
  // member_id is a soft scope: validate it belongs to the household, else shared.
  let memberId: string | null = null
  const wanted = body?.member_id?.trim()
  if (wanted) {
    const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
      .bind(wanted, actor.householdId)
      .first<{ 1: number }>()
    memberId = m ? wanted : null
  }
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO trip_packing (id, household_id, trip_id, member_id, text, packed_at, position, created_at) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
  )
    .bind(id, actor.householdId, tripId, memberId, text.slice(0, TEXT_CAP), ts)
    .run()
  return ok({ ok: true, id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    packed?: boolean
    text?: string
    tripId?: string
    clearChecked?: boolean
    ids?: unknown
  }>(ctx.request)
  const ts = nowSec()

  // Bulk "Effacer cochées" — soft-delete the checked rows of one trip. Optional `ids`
  // scopes the clear to exactly the ticked rows (so a check made after the deferred
  // undo was scheduled isn't swept up); absent → every packed row of that trip.
  if (body?.clearChecked) {
    const tripId = body?.tripId?.trim()
    if (!tripId) return badRequest('tripId requis.')
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null
    if (ids && ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      await ctx.env.DB.prepare(
        `UPDATE trip_packing SET deleted_at = ? WHERE household_id = ? AND trip_id = ? AND id IN (${ph})`,
      )
        .bind(ts, actor.householdId, tripId, ...ids)
        .run()
    } else if (!ids) {
      await ctx.env.DB.prepare(
        'UPDATE trip_packing SET deleted_at = ? WHERE household_id = ? AND trip_id = ? AND packed_at IS NOT NULL AND deleted_at IS NULL',
      )
        .bind(ts, actor.householdId, tripId)
        .run()
    }
    return ok({ ok: true })
  }

  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  if (typeof body?.packed === 'boolean') {
    await ctx.env.DB.prepare('UPDATE trip_packing SET packed_at = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.packed ? ts : null, ts, id, actor.householdId)
      .run()
  }
  if (typeof body?.text === 'string' && body.text.trim()) {
    await ctx.env.DB.prepare('UPDATE trip_packing SET text = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(body.text.trim().slice(0, TEXT_CAP), ts, id, actor.householdId)
      .run()
  }
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  await ctx.env.DB.prepare('UPDATE trip_packing SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
