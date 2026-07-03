import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'
import { requireSharedTripMember, nudgeSharedTrip, householdName } from '../_lib/sharedTrip'

// « Voyage partagé » content — the shared-trip twin of trip-notes: the UNIFIED store for
// the collaborative itinerary / categorized infos / documents that EVERY member household
// edits live. Same row shape as trip_notes minus member scoping — attribution is a
// HOUSEHOLD, never a member id (member ids never cross households). The SAME body field
// names as trip-notes (`tripId` = the SHARED trip id) so TripNoteAdd / MemoControls need
// no shape change when the VoyageApi context points them here.
//
//   GET    /api/shared-trip-notes?tripId=<id>  -> that trip's notes, itinerary-then-infos
//   POST   /api/shared-trip-notes              -> { tripId, category?, label?, text?, date?, media_kind?, media_key?, scene_key? }
//   PATCH  /api/shared-trip-notes              -> { id, text?, label?, category?, date?, media_key?, scene_key? }
//   DELETE /api/shared-trip-notes              -> { id } (soft; frees media)
//
// Any member may PATCH/DELETE any note (last-write-wins, the app's conflict model). POST
// IGNORES any member_id in the body and stamps author_household_id + author_label (the
// household's name at write time — the postbox free-text rule, so it survives a leave).

interface SharedTripNoteRow {
  id: string
  shared_trip_id: string
  category: string
  label: string | null
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  author_household_id: string | null
  author_label: string | null
  date: number | null
  position: number
  created_at: number
  updated_at: number | null
}

const COLS =
  'id, shared_trip_id, category, label, text, media_kind, media_key, scene_key, author_household_id, author_label, date, position, created_at, updated_at'
const TEXT_CAP = 2000
const VALID_CATEGORIES = new Set(['flight', 'hotel', 'car', 'activity', 'contact', 'document', 'general'])
const cat = (v: unknown): string => (typeof v === 'string' && VALID_CATEGORIES.has(v) ? v : 'general')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const onRequestGet = authed(async (ctx, actor) => {
  const tripId = new URL(ctx.request.url).searchParams.get('tripId')?.trim()
  const gate = await requireSharedTripMember(ctx.env, actor, tripId)
  if (gate instanceof Response) return gate
  const rows = await ctx.env.DB.prepare(
    `SELECT ${COLS} FROM shared_trip_notes WHERE shared_trip_id = ? AND deleted_at IS NULL ORDER BY (date IS NULL), date, position, created_at DESC`,
  )
    .bind(gate.trip.id)
    .all<SharedTripNoteRow>()
  return ok({ notes: rows.results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    tripId?: string
    category?: string
    label?: string
    text?: string
    date?: number | null
    media_kind?: string
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.tripId)
  if (gate instanceof Response) return gate

  const text = body?.text?.trim() ?? ''
  // A note is a written line OR a media memo (audio #38 / drawing #14 / image #13 — an
  // image also covers an uploaded document/PDF, the key self-describes its type).
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  const label = body?.label?.trim()?.slice(0, 200) || null
  if (!text && !label && !(kind && mediaKey)) return badRequest('Note vide.')
  const sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
  // Attribution is stamped server-side (never taken from the body): the acting household
  // + its display name at write time. author_label survives the household later leaving.
  const authorLabel = await householdName(ctx.env, actor.householdId)

  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO shared_trip_notes (id, shared_trip_id, category, label, text, media_kind, media_key, scene_key, author_household_id, author_label, date, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(
      id,
      gate.trip.id,
      cat(body?.category),
      label,
      text.slice(0, TEXT_CAP),
      kind,
      mediaKey,
      sceneKey,
      actor.householdId,
      authorLabel,
      num(body?.date),
      nowSec(),
    )
    .run()
  // ['month'] rides along: a dated itinerary note shows on every member household's
  // month grid + day page (membership-scoped read in api/month.ts), so the calendar
  // must refresh live, not just the shared scene's own note list.
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-notes'], ['month']])
  return ok({ ok: true, id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    text?: string
    label?: string
    category?: string
    date?: number | null
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  // Any member may edit any note (LWW). Read the row unscoped-by-household, then gate on
  // membership of its shared trip.
  const row = await ctx.env.DB.prepare(
    'SELECT shared_trip_id, media_kind, media_key, scene_key FROM shared_trip_notes WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{ shared_trip_id: string; media_kind: string | null; media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Note introuvable.')
  const gate = await requireSharedTripMember(ctx.env, actor, row.shared_trip_id)
  if (gate instanceof Response) return gate

  const sets: string[] = []
  const vals: unknown[] = []
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = ?`)
    vals.push(val)
  }
  if (typeof body?.text === 'string') set('text', body.text.trim().slice(0, TEXT_CAP))
  if (typeof body?.label === 'string') set('label', body.label.trim().slice(0, 200) || null)
  if (typeof body?.category === 'string') set('category', cat(body.category))
  if ('date' in (body ?? {})) set('date', num(body?.date))
  // Re-draw: swap a drawing's media + scene, free the superseded (share-owned) blobs.
  const newMediaKey = body?.media_key?.trim()
  if (newMediaKey) {
    if (row.media_kind !== 'drawing') return badRequest('Cette note n’est pas un dessin.')
    const sceneKey = isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
    if (row.media_key && row.media_key !== newMediaKey) await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
    if (row.scene_key && row.scene_key !== sceneKey) await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
    set('media_key', newMediaKey)
    set('scene_key', sceneKey)
  }
  if (sets.length === 0) return badRequest('Rien à modifier.')
  set('updated_at', nowSec())
  vals.push(id)
  await ctx.env.DB.prepare(`UPDATE shared_trip_notes SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-notes'], ['month']])
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    'SELECT shared_trip_id, media_key, scene_key FROM shared_trip_notes WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{ shared_trip_id: string; media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Note introuvable.')
  const gate = await requireSharedTripMember(ctx.env, actor, row.shared_trip_id)
  if (gate instanceof Response) return gate
  await deleteR2Blob(ctx.env.PHOTOS, row.media_key)
  await deleteR2Blob(ctx.env.PHOTOS, row.scene_key)
  await ctx.env.DB.prepare('UPDATE shared_trip_notes SET deleted_at = ? WHERE id = ?')
    .bind(nowSec(), id)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-notes'], ['month']])
  return ok({ ok: true })
}, 'operator')
