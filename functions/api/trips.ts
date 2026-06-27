import { badRequest, notFound, ok, readJson, parseJsonArray } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'

// « Voyage » — the trip notebook itself (migration 0092). One row per trip: a title,
// destination, a LOCAL-midnight date range (start_at..end_at inclusive), who's going
// (members JSON), an optional cover photo (R2), and a tint. Its content lives in
// trip_notes (itinerary + categorized info + documents) and trip_packing.
//
//   GET    /api/trips        -> all live trips, soonest-upcoming first
//   POST   /api/trips        -> create { title, destination?, startAt?, endAt?, members?, colour? }
//   PATCH  /api/trips        -> edit { id, title?, destination?, startAt?, endAt?, members?, colour?, notes?, media_kind?, media_key? }
//   DELETE /api/trips        -> soft-delete { id } (frees the cover blob)
//
// Operator-only: a trip is household planning, not a kiosk/guest concern.

interface TripRow {
  id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  members: string
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
  position: number
  created_at: number
  updated_at: number | null
}

const COLS =
  'id, title, destination, start_at, end_at, members, media_kind, media_key, colour, notes, position, created_at, updated_at'
const TITLE_CAP = 200
const TEXT_CAP = 2000

// A trip carries the list of member ids going on it. Stored as a JSON array of soft
// refs (no FK — deleting a member never cascades a trip); parsed back to string[].
function cleanMembers(v: unknown): string {
  const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  return JSON.stringify([...new Set(arr)].slice(0, 50))
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const onRequestGet = authed(async (ctx, actor) => {
  const rows = await ctx.env.DB.prepare(
    // Soonest start first, then undated, then newest — the board "Prochain voyage"
    // card reads the first upcoming one off this order.
    `SELECT ${COLS} FROM trips WHERE household_id = ? AND deleted_at IS NULL ORDER BY (start_at IS NULL), start_at, created_at DESC`,
  )
    .bind(actor.householdId)
    .all<TripRow>()
  const trips = rows.results.map((r) => ({ ...r, members: parseJsonArray<string>(r.members) }))
  return ok({ trips })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    title?: string
    destination?: string
    startAt?: number | null
    endAt?: number | null
    members?: unknown
    colour?: string
  }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO trips (id, household_id, title, destination, start_at, end_at, members, colour, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(
      id,
      actor.householdId,
      title.slice(0, TITLE_CAP),
      body?.destination?.trim()?.slice(0, TITLE_CAP) || null,
      num(body?.startAt),
      num(body?.endAt),
      cleanMembers(body?.members),
      typeof body?.colour === 'string' && body.colour.trim() ? body.colour.trim().slice(0, 32) : '#88a36f',
      ts,
    )
    .run()
  return ok({ ok: true, id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    title?: string
    destination?: string
    startAt?: number | null
    endAt?: number | null
    members?: unknown
    colour?: string
    notes?: string
    media_kind?: string
    media_key?: string
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  const row = await ctx.env.DB.prepare(
    'SELECT media_key FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null }>()
  if (!row) return notFound('Voyage introuvable.')

  // Build a sparse UPDATE: only the fields actually present change. A swapped cover
  // photo frees the superseded blob (best-effort).
  const sets: string[] = []
  const vals: unknown[] = []
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = ?`)
    vals.push(val)
  }
  if (typeof body?.title === 'string' && body.title.trim()) set('title', body.title.trim().slice(0, TITLE_CAP))
  if (typeof body?.destination === 'string') set('destination', body.destination.trim().slice(0, TITLE_CAP) || null)
  if ('startAt' in (body ?? {})) set('start_at', num(body?.startAt))
  if ('endAt' in (body ?? {})) set('end_at', num(body?.endAt))
  if ('members' in (body ?? {})) set('members', cleanMembers(body?.members))
  if (typeof body?.colour === 'string' && body.colour.trim()) set('colour', body.colour.trim().slice(0, 32))
  if (typeof body?.notes === 'string') set('notes', body.notes.trim().slice(0, TEXT_CAP) || null)
  if (typeof body?.media_key === 'string' && body.media_key.trim()) {
    set('media_kind', 'image') // cover is always a photo
    set('media_key', body.media_key.trim())
    if (row.media_key && row.media_key !== body.media_key.trim()) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
  }
  if (sets.length === 0) return badRequest('Rien à modifier.')
  set('updated_at', nowSec())
  vals.push(id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE trips SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...vals)
    .run()
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  // Free the cover blob; the trip's notes/packing media is freed as those rows are
  // cleared. Best-effort R2 delete never blocks the soft-delete.
  const row = await ctx.env.DB.prepare(
    'SELECT media_key FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  const ts = nowSec()
  await ctx.env.DB.prepare('UPDATE trips SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(ts, id, actor.householdId)
    .run()
  // Soft-delete the trip's content too, so a re-created trip never inherits orphans.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE trip_notes SET deleted_at = ? WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL').bind(ts, id, actor.householdId),
    ctx.env.DB.prepare('UPDATE trip_packing SET deleted_at = ? WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL').bind(ts, id, actor.householdId),
  ])
  return ok({ ok: true })
}, 'operator')
