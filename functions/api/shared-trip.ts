import { badRequest, forbidden, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { deleteR2Blob, copyR2Blob } from '../_lib/r2'
import { isValidR2Key } from '../_lib/validate'
import {
  requireSharedTripMember,
  nudgeSharedTrip,
  householdName,
  mapPackingMemberToBagLabel,
  SHARED_TRIP_COLS,
  type SharedTripRow,
} from '../_lib/sharedTrip'
import type { Ctx } from '../_lib/env'

// « Voyage partagé » — the shared trip itself (migration 0101). ONE trip, live-edited by
// up to 6 operator households. This handler owns the trip meta + its two lifecycle
// events: PROMOTE (move a private trip into the shared store) and DISSOLVE (owner tears
// it down). Content lives in shared_trip_notes / shared_trip_packing; membership +
// invite links in shared-trip-{join,leave,invite}.
//
//   GET    /api/shared-trip            -> my memberships joined to trips (list)
//   GET    /api/shared-trip?id=<id>    -> one trip (membership-checked)
//   POST   /api/shared-trip            -> create { title, ... } OR promote { fromTripId }
//   PATCH  /api/shared-trip            -> sparse edit { id, ... } (any member; LWW)
//   DELETE /api/shared-trip            -> dissolve { id } (owner only)
//
// All operator-only. The trip lives in NEITHER household, so authorization is a live
// shared_trip_members row (requireSharedTripMember), never a household_id filter.

const TITLE_CAP = 200
const TEXT_CAP = 2000
const DEFAULT_COLOUR = '#88a36f'
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const colourOf = (v: unknown): string =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 32) : DEFAULT_COLOUR

interface MemberBrief {
  shared_trip_id: string
  household_id: string
  label: string
  colour: string
  role: string
}

// Shape one trip row + its live members for the SPA (mirrors trips.ts's mapped output).
function shapeTrip(t: SharedTripRow, members: MemberBrief[], myRole: string) {
  return {
    ...t,
    members: members
      .filter((m) => m.shared_trip_id === t.id)
      .map((m) => ({ household_id: m.household_id, label: m.label, colour: m.colour, role: m.role })),
    myRole,
  }
}

async function liveMembersFor(ctx: Ctx, tripIds: string[]): Promise<MemberBrief[]> {
  if (tripIds.length === 0) return []
  const ph = tripIds.map(() => '?').join(',')
  const rows = await ctx.env.DB.prepare(
    `SELECT shared_trip_id, household_id, label, colour, role FROM shared_trip_members WHERE shared_trip_id IN (${ph}) AND revoked_at IS NULL`,
  )
    .bind(...tripIds)
    .all<MemberBrief>()
  return rows.results
}

export const onRequestGet = authed(async (ctx, actor) => {
  const id = new URL(ctx.request.url).searchParams.get('id')?.trim()
  if (id) {
    const gate = await requireSharedTripMember(ctx.env, actor, id)
    if (gate instanceof Response) return gate
    const members = await liveMembersFor(ctx, [gate.trip.id])
    // myHouseholdId lets the SPA tell OWN vs other households' packing bags apart
    // (own = editable, others = read-only). The membership rows all carry household_id
    // but none is flagged "me", so the actor's household is named explicitly here.
    return ok({
      trip: shapeTrip(gate.trip, members, gate.membership.role),
      myHouseholdId: gate.membership.household_id,
    })
  }
  // The list: every live trip this household is a live member of, soonest-upcoming first.
  const rows = await ctx.env.DB.prepare(
    `SELECT ${SHARED_TRIP_COLS.split(', ')
      .map((c) => `st.${c}`)
      .join(', ')}, stm.role AS my_role
       FROM shared_trips st
       JOIN shared_trip_members stm ON stm.shared_trip_id = st.id
      WHERE stm.household_id = ? AND stm.revoked_at IS NULL AND st.deleted_at IS NULL
      ORDER BY (st.start_at IS NULL), st.start_at, st.created_at DESC`,
  )
    .bind(actor.householdId)
    .all<SharedTripRow & { my_role: string }>()
  const members = await liveMembersFor(
    ctx,
    rows.results.map((r) => r.id),
  )
  const trips = rows.results.map(({ my_role, ...t }) => shapeTrip(t, members, my_role))
  return ok({ trips })
}, 'operator')

// POST: create from scratch OR promote an existing private trip. Branches on `fromTripId`.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    fromTripId?: string
    title?: string
    destination?: string
    startAt?: number | null
    endAt?: number | null
    colour?: string
    notes?: string
  }>(ctx.request)

  if (body?.fromTripId?.trim()) return promote(ctx, actor.householdId, body.fromTripId.trim())

  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  const ts = nowSec()
  const label = await householdName(ctx.env, actor.householdId)
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'INSERT INTO shared_trips (id, owner_household_id, title, destination, start_at, end_at, colour, notes, invite_nonce, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    ).bind(
      id,
      actor.householdId,
      title.slice(0, TITLE_CAP),
      body?.destination?.trim()?.slice(0, TITLE_CAP) || null,
      num(body?.startAt),
      num(body?.endAt),
      colourOf(body?.colour),
      typeof body?.notes === 'string' ? body.notes.trim().slice(0, TEXT_CAP) || null : null,
      newId(),
      ts,
    ),
    ctx.env.DB.prepare(
      "INSERT INTO shared_trip_members (id, shared_trip_id, household_id, role, label, joined_at, created_at) VALUES (?, ?, ?, 'owner', ?, ?, ?)",
    ).bind(newId(), id, actor.householdId, label, ts, ts),
  ])
  // A dated trip is a calendar band + a board VoyageCard, so nudge ['month']/['board']
  // (via the membership-scoped read in api/month.ts) alongside the shared-trips list — so
  // every member household's calendar/board refreshes live, not just its own devices.
  nudgeSharedTrip(ctx, id, [['shared-trips'], ['trips'], ['board'], ['month']])
  return ok({ ok: true, id })
}, 'operator')

// PROMOTE = MOVE a private household trip into the shared store (design doc: one source
// of truth). Media blobs are COPIED to share-owned `st_`/`ss_` keys; then the private
// trip + its notes/packing soft-delete and their original blobs free. Not undoable.
async function promote(ctx: Ctx, householdId: string, fromTripId: string): Promise<Response> {
  const src = await ctx.env.DB.prepare(
    'SELECT id, title, destination, start_at, end_at, media_kind, media_key, colour, notes FROM trips WHERE id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(fromTripId, householdId)
    .first<{
      id: string
      title: string
      destination: string | null
      start_at: number | null
      end_at: number | null
      media_kind: string | null
      media_key: string | null
      colour: string
      notes: string | null
    }>()
  if (!src) return notFound('Voyage introuvable.')

  const notes = await ctx.env.DB.prepare(
    'SELECT id, category, label, text, media_kind, media_key, scene_key, date, position, created_at FROM trip_notes WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(fromTripId, householdId)
    .all<{
      id: string
      category: string
      label: string | null
      text: string
      media_kind: string | null
      media_key: string | null
      scene_key: string | null
      date: number | null
      position: number
      created_at: number
    }>()
  const packing = await ctx.env.DB.prepare(
    'SELECT id, member_id, text, packed_at, position, created_at FROM trip_packing WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(fromTripId, householdId)
    .all<{ id: string; member_id: string | null; text: string; packed_at: number | null; position: number; created_at: number }>()
  const memberRows = await ctx.env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
    .bind(householdId)
    .all<{ id: string; display_name: string }>()
  const memberNames = new Map(memberRows.results.map((m) => [m.id, m.display_name]))

  const sharedId = newId()
  const ts = nowSec()
  const label = await householdName(ctx.env, householdId)

  // Copy the cover blob to a share-owned key (best-effort; null when R2 unset / missing).
  const newCover = await copyR2Blob(ctx.env.PHOTOS, src.media_key, 'st')
  const inserts: D1PreparedStatement[] = [
    ctx.env.DB.prepare(
      'INSERT INTO shared_trips (id, owner_household_id, title, destination, start_at, end_at, media_kind, media_key, colour, notes, invite_nonce, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    ).bind(
      sharedId,
      householdId,
      src.title.slice(0, TITLE_CAP),
      src.destination,
      src.start_at,
      src.end_at,
      newCover ? 'image' : null, // invariant: media_key set iff media_kind set
      newCover,
      colourOf(src.colour),
      src.notes,
      newId(),
      ts,
    ),
    ctx.env.DB.prepare(
      "INSERT INTO shared_trip_members (id, shared_trip_id, household_id, role, label, joined_at, created_at) VALUES (?, ?, ?, 'owner', ?, ?, ?)",
    ).bind(newId(), sharedId, householdId, label, ts, ts),
  ]

  // Notes carry the promoter as author; their media/scene blobs copy to share-owned keys.
  for (const n of notes.results) {
    const kind = n.media_kind === 'audio' || n.media_kind === 'drawing' || n.media_kind === 'image' ? n.media_kind : null
    const newKey = kind ? await copyR2Blob(ctx.env.PHOTOS, n.media_key, 'st') : null
    const newScene = kind === 'drawing' ? await copyR2Blob(ctx.env.PHOTOS, n.scene_key, 'ss') : null
    inserts.push(
      ctx.env.DB.prepare(
        'INSERT INTO shared_trip_notes (id, shared_trip_id, category, label, text, media_kind, media_key, scene_key, author_household_id, author_label, date, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        newId(),
        sharedId,
        n.category,
        n.label,
        n.text.slice(0, TEXT_CAP),
        newKey ? kind : null, // invariant: media_key set iff media_kind set
        newKey,
        newScene,
        householdId,
        label,
        n.date,
        n.position,
        n.created_at,
      ),
    )
  }
  // Packing → the promoter's bags: member_id → bag_label (display name); NULL = shared bag.
  for (const p of packing.results) {
    inserts.push(
      ctx.env.DB.prepare(
        'INSERT INTO shared_trip_packing (id, shared_trip_id, household_id, bag_label, text, packed_at, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        newId(),
        sharedId,
        householdId,
        mapPackingMemberToBagLabel(p.member_id, memberNames),
        p.text,
        p.packed_at,
        p.position,
        p.created_at,
      ),
    )
  }

  // Write the shared rows first (chunked so a big trip stays under D1's batch limits).
  for (let i = 0; i < inserts.length; i += 20) await ctx.env.DB.batch(inserts.slice(i, i + 20))

  // Then MOVE: soft-delete the private trip + its content so the board/calendar drops it.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE trips SET deleted_at = ? WHERE id = ? AND household_id = ?').bind(ts, fromTripId, householdId),
    ctx.env.DB.prepare('UPDATE trip_notes SET deleted_at = ? WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL').bind(ts, fromTripId, householdId),
    ctx.env.DB.prepare('UPDATE trip_packing SET deleted_at = ? WHERE trip_id = ? AND household_id = ? AND deleted_at IS NULL').bind(ts, fromTripId, householdId),
  ])
  // Free the ORIGINAL private blobs (the share owns its own `st_`/`ss_` copies now).
  await deleteR2Blob(ctx.env.PHOTOS, src.media_key)
  for (const n of notes.results) {
    await deleteR2Blob(ctx.env.PHOTOS, n.media_key)
    await deleteR2Blob(ctx.env.PHOTOS, n.scene_key)
  }
  // Promote MOVED a dated band into the shared store — nudge ['month']/['board'] so the
  // now-shared trip re-surfaces on the calendar/board (membership-scoped read in
  // api/month.ts), matching the household hook's [['shared-trip']] keys.
  nudgeSharedTrip(ctx, sharedId, [['shared-trips'], ['trips'], ['board'], ['month']])
  return ok({ ok: true, id: sharedId })
}

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{
    id?: string
    title?: string
    destination?: string
    startAt?: number | null
    endAt?: number | null
    colour?: string
    notes?: string
    media_key?: string
  }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.id)
  if (gate instanceof Response) return gate

  // Sparse UPDATE (trips.ts-style presence/typeof gates); any member may edit (LWW). A
  // swapped cover frees the superseded share-owned blob.
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
  if (typeof body?.colour === 'string' && body.colour.trim()) set('colour', body.colour.trim().slice(0, 32))
  if (typeof body?.notes === 'string') set('notes', body.notes.trim().slice(0, TEXT_CAP) || null)
  if (typeof body?.media_key === 'string' && body.media_key.trim() && isValidR2Key(body.media_key.trim())) {
    set('media_kind', 'image') // cover is always a photo
    set('media_key', body.media_key.trim())
    if (gate.trip.media_key && gate.trip.media_key !== body.media_key.trim())
      await deleteR2Blob(ctx.env.PHOTOS, gate.trip.media_key)
  }
  if (sets.length === 0) return badRequest('Rien à modifier.')
  set('updated_at', nowSec())
  vals.push(gate.trip.id)
  await ctx.env.DB.prepare(`UPDATE shared_trips SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trips'], ['trips'], ['board'], ['month']])
  return ok({ ok: true })
}, 'operator')

// DISSOLVE — the owner tears the whole shared trip down. Soft-deletes the trip + all
// content, frees every share-owned blob, and revokes every membership so open pages on
// the other households flip to "n'existe plus". Only the owner (not a plain member) may.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.id)
  if (gate instanceof Response) return gate
  if (gate.membership.role !== 'owner') return forbidden('Seul le propriétaire peut dissoudre ce voyage.')

  // Free the cover + every note's media/scene blob (best-effort; no-ops when R2 unset).
  await deleteR2Blob(ctx.env.PHOTOS, gate.trip.media_key)
  const blobs = await ctx.env.DB.prepare(
    'SELECT media_key, scene_key FROM shared_trip_notes WHERE shared_trip_id = ? AND deleted_at IS NULL',
  )
    .bind(gate.trip.id)
    .all<{ media_key: string | null; scene_key: string | null }>()
  for (const b of blobs.results) {
    await deleteR2Blob(ctx.env.PHOTOS, b.media_key)
    await deleteR2Blob(ctx.env.PHOTOS, b.scene_key)
  }

  const ts = nowSec()
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE shared_trips SET deleted_at = ? WHERE id = ?').bind(ts, gate.trip.id),
    ctx.env.DB.prepare('UPDATE shared_trip_notes SET deleted_at = ? WHERE shared_trip_id = ? AND deleted_at IS NULL').bind(ts, gate.trip.id),
    ctx.env.DB.prepare('UPDATE shared_trip_packing SET deleted_at = ? WHERE shared_trip_id = ? AND deleted_at IS NULL').bind(ts, gate.trip.id),
    ctx.env.DB.prepare('UPDATE shared_trip_members SET revoked_at = ? WHERE shared_trip_id = ? AND revoked_at IS NULL').bind(ts, gate.trip.id),
  ])
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trips'], ['trips'], ['board'], ['month']])
  return ok({ ok: true })
}, 'operator')
