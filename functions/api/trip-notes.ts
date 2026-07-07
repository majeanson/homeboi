import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'
import type { Ctx } from '../_lib/env'

// « Voyage » content — the UNIFIED store for a trip's categorized info, day-by-day
// itinerary, documents and contacts (migration 0092). A generalized family_notes row:
// text OR media (audio / drawing / image / a document PDF as 'image'), optionally
// scoped to a member ("kids stuff / parents stuff"), with two extra discriminators:
//   category — flight|hotel|car|activity|contact|document|general
//   date     — NULL = atemporal info (Infos tab); local-midnight = an itinerary day
// The SAME composer (MemoControls + an EditField text row) writes here, exactly as the
// fridge-note + family-note composers do — that's the whole point: one input for trips.
//
//   GET    /api/trip-notes?tripId=<id>  -> that trip's notes, newest first
//   POST   /api/trip-notes              -> { tripId, category?, label?, text?, member_id?, date?, media_kind?, media_key?, scene_key? }
//   PATCH  /api/trip-notes              -> { id, text?, label?, category?, date?, position?, media_key?, scene_key? }
//   DELETE /api/trip-notes              -> { id } (soft; frees media)

interface TripNoteRow {
  id: string
  trip_id: string
  category: string
  label: string | null
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  member_id: string | null
  date: number | null
  position: number
  created_at: number
  updated_at: number | null
}

const COLS =
  'id, trip_id, category, label, text, media_kind, media_key, scene_key, member_id, date, position, created_at, updated_at'
const TEXT_CAP = 2000
const VALID_CATEGORIES = new Set(['flight', 'hotel', 'car', 'activity', 'contact', 'document', 'general'])
const cat = (v: unknown): string => (typeof v === 'string' && VALID_CATEGORIES.has(v) ? v : 'general')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Confirm a member id belongs to this household before storing it as a soft scope.
async function validMember(ctx: Ctx, householdId: string, id: string | null | undefined): Promise<string | null> {
  const wanted = id?.trim()
  if (!wanted) return null
  const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id = ? AND household_id = ?')
    .bind(wanted, householdId)
    .first<{ 1: number }>()
  return m ? wanted : null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const tripId = new URL(ctx.request.url).searchParams.get('tripId')?.trim()
  if (!tripId) return badRequest('tripId requis.')
  const rows = await ctx.env.DB.prepare(
    `SELECT ${COLS} FROM trip_notes WHERE household_id = ? AND trip_id = ? AND deleted_at IS NULL ORDER BY (date IS NULL), date, position, created_at DESC`,
  )
    .bind(actor.householdId, tripId)
    .all<TripNoteRow>()
  return ok({ notes: rows.results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    tripId?: string
    category?: string
    label?: string
    text?: string
    member_id?: string | null
    date?: number | null
    media_kind?: string
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const tripId = body?.tripId?.trim()
  if (!tripId) return badRequest('tripId requis.')
  // Trip must exist + belong to this household (the note carries household_id too).
  const trip = await ctx.env.DB.prepare('SELECT 1 FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(tripId, actor.householdId)
    .first<{ 1: number }>()
  if (!trip) return notFound('Voyage introuvable.')

  const text = body?.text?.trim() ?? ''
  // A note is a written line OR a media memo (audio #38 / drawing #14 / image #13 —
  // an image also covers an uploaded document/PDF, the key self-describes its type).
  const kind =
    body?.media_kind === 'audio' || body?.media_kind === 'drawing' || body?.media_kind === 'image'
      ? body.media_kind
      : null
  const mediaKey = kind ? body?.media_key?.trim() || null : null
  const label = body?.label?.trim()?.slice(0, 200) || null
  if (!text && !label && !(kind && mediaKey)) return badRequest('Note vide.')
  const sceneKey = kind === 'drawing' && isValidR2Key(body?.scene_key?.trim()) ? body!.scene_key!.trim() : null
  const memberId = await validMember(ctx, actor.householdId, body?.member_id)

  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO trip_notes (id, household_id, trip_id, category, label, text, media_kind, media_key, scene_key, member_id, date, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(
      id,
      actor.householdId,
      tripId,
      cat(body?.category),
      label,
      text.slice(0, TEXT_CAP),
      kind,
      mediaKey,
      sceneKey,
      memberId,
      num(body?.date),
      nowSec(),
    )
    .run()
  return ok({ ok: true, id })
}, 'operator')

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    text?: string
    label?: string
    category?: string
    date?: number | null
    position?: number
    media_key?: string
    scene_key?: string
  }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')

  const row = await ctx.env.DB.prepare(
    'SELECT media_kind, media_key, scene_key FROM trip_notes WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_kind: string | null; media_key: string | null; scene_key: string | null }>()
  if (!row) return notFound('Note introuvable.')

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
  // Itinerary reorder: the client renumbers a day's rows 0..n-1 (one PATCH per moved
  // row); the GET's `ORDER BY … position, created_at DESC` then pins the new order.
  if (typeof body?.position === 'number' && Number.isFinite(body.position))
    set('position', Math.max(0, Math.trunc(body.position)))
  // Re-draw: swap a drawing's media + scene, free the superseded blobs.
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
  vals.push(id, actor.householdId)
  await ctx.env.DB.prepare(`UPDATE trip_notes SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`)
    .bind(...vals)
    .run()
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key FROM trip_notes WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string | null; scene_key: string | null }>()
  await deleteR2Blob(ctx.env.PHOTOS, row?.media_key)
  await deleteR2Blob(ctx.env.PHOTOS, row?.scene_key)
  await ctx.env.DB.prepare('UPDATE trip_notes SET deleted_at = ? WHERE id = ? AND household_id = ?')
    .bind(nowSec(), id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
