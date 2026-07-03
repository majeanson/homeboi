import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { requireSharedTripMember, nudgeSharedTrip } from '../_lib/sharedTrip'

// « Voyage partagé » → Bagages — the shared-trip twin of trip-packing, but scoped by
// HOUSEHOLD, not member (product decision): each household edits its OWN bag(s); every
// other household sees them READ-ONLY. bag_label NULL = that household's shared bag; a
// free-text label = a per-person bag ("Léa"). "Packed" is a soft mark in place
// (packed_at, like todos.done_at) — never a count / "n of m" / quantity (calm).
//
//   GET    /api/shared-trip-packing?tripId=<id> -> ALL bags (rows carry household_id + bag_label)
//   POST   /api/shared-trip-packing             -> add { tripId, text, bag_label? } (own household)
//   PATCH  /api/shared-trip-packing             -> { id, packed?, text?, bag_label? } OR bulk { tripId, clearChecked, ids? }
//   DELETE /api/shared-trip-packing             -> remove { id }
//
// PATCH/DELETE lookups add `AND household_id = <actor>` so another household's bag is
// STRUCTURALLY read-only — a forged id targeting someone else's row simply matches nothing.

interface PackingRow {
  id: string
  shared_trip_id: string
  household_id: string
  bag_label: string | null
  text: string
  packed_at: number | null
  position: number
  created_at: number
}

const COLS = 'id, shared_trip_id, household_id, bag_label, text, packed_at, position, created_at'
const TEXT_CAP = 200
const LABEL_CAP = 80
const cleanLabel = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, LABEL_CAP) : null

export const onRequestGet = authed(async (ctx, actor) => {
  const tripId = new URL(ctx.request.url).searchParams.get('tripId')?.trim()
  const gate = await requireSharedTripMember(ctx.env, actor, tripId)
  if (gate instanceof Response) return gate
  const rows = await ctx.env.DB.prepare(
    `SELECT ${COLS} FROM shared_trip_packing WHERE shared_trip_id = ? AND deleted_at IS NULL ORDER BY household_id, (bag_label IS NULL) DESC, bag_label, position, created_at`,
  )
    .bind(gate.trip.id)
    .all<PackingRow>()
  return ok({ items: rows.results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ tripId?: string; text?: string; bag_label?: string | null }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte requis.')
  const gate = await requireSharedTripMember(ctx.env, actor, body?.tripId)
  if (gate instanceof Response) return gate
  const id = newId()
  const ts = nowSec()
  // household_id is FORCED to the actor's — a household can only add to its own bags.
  await ctx.env.DB.prepare(
    'INSERT INTO shared_trip_packing (id, shared_trip_id, household_id, bag_label, text, packed_at, position, created_at) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
  )
    .bind(id, gate.trip.id, actor.householdId, cleanLabel(body?.bag_label), text.slice(0, TEXT_CAP), ts)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-packing']])
  return ok({ ok: true, id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    packed?: boolean
    text?: string
    bag_label?: string | null
    tripId?: string
    clearChecked?: boolean
    ids?: unknown
  }>(ctx.request)
  const ts = nowSec()

  // Bulk "Effacer cochées" — only this household's checked rows of the trip. Optional
  // `ids` scopes it to exactly the ticked rows (so a check made after the deferred undo
  // was scheduled isn't swept up); absent → every packed row this household owns.
  if (body?.clearChecked) {
    const gate = await requireSharedTripMember(ctx.env, actor, body?.tripId)
    if (gate instanceof Response) return gate
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null
    if (ids && ids.length > 0) {
      const ph = ids.map(() => '?').join(',')
      await ctx.env.DB.prepare(
        `UPDATE shared_trip_packing SET deleted_at = ? WHERE shared_trip_id = ? AND household_id = ? AND id IN (${ph})`,
      )
        .bind(ts, gate.trip.id, actor.householdId, ...ids)
        .run()
    } else if (!ids) {
      await ctx.env.DB.prepare(
        'UPDATE shared_trip_packing SET deleted_at = ? WHERE shared_trip_id = ? AND household_id = ? AND packed_at IS NOT NULL AND deleted_at IS NULL',
      )
        .bind(ts, gate.trip.id, actor.householdId)
        .run()
    }
    nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-packing']])
    return ok({ ok: true })
  }

  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Read the row scoped to THIS household so another household's item can't be edited;
  // the shared_trip_id also drives the membership check + the realtime nudge room.
  const row = await ctx.env.DB.prepare(
    'SELECT shared_trip_id FROM shared_trip_packing WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ shared_trip_id: string }>()
  if (!row) return notFound('Article introuvable.')
  const gate = await requireSharedTripMember(ctx.env, actor, row.shared_trip_id)
  if (gate instanceof Response) return gate

  if (typeof body?.packed === 'boolean') {
    await ctx.env.DB.prepare(
      'UPDATE shared_trip_packing SET packed_at = ?, updated_at = ? WHERE id = ? AND household_id = ?',
    )
      .bind(body.packed ? ts : null, ts, id, actor.householdId)
      .run()
  }
  if (typeof body?.text === 'string' && body.text.trim()) {
    await ctx.env.DB.prepare(
      'UPDATE shared_trip_packing SET text = ?, updated_at = ? WHERE id = ? AND household_id = ?',
    )
      .bind(body.text.trim().slice(0, TEXT_CAP), ts, id, actor.householdId)
      .run()
  }
  // Move an item between this household's own bags. Present-key gate so a packed/text
  // PATCH doesn't accidentally clear the label; '' / null = the household's shared bag.
  if ('bag_label' in (body ?? {})) {
    await ctx.env.DB.prepare(
      'UPDATE shared_trip_packing SET bag_label = ?, updated_at = ? WHERE id = ? AND household_id = ?',
    )
      .bind(cleanLabel(body?.bag_label), ts, id, actor.householdId)
      .run()
  }
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-packing']])
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    'SELECT shared_trip_id FROM shared_trip_packing WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ shared_trip_id: string }>()
  if (!row) return notFound('Article introuvable.')
  const gate = await requireSharedTripMember(ctx.env, actor, row.shared_trip_id)
  if (gate instanceof Response) return gate
  await ctx.env.DB.prepare('UPDATE shared_trip_packing SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-packing']])
  return ok({ ok: true })
}, 'operator')
