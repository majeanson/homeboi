import { forbidden, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { copyR2Blob } from '../_lib/r2'
import { requireSharedTripMember, nudgeSharedTrip, matchBagLabelToMember } from '../_lib/sharedTrip'
import type { Ctx } from '../_lib/env'

// « Voyage partagé » leave. A MEMBER household drops its grant; the OWNER can't leave
// (they dissolve instead — shared-trip DELETE). Optional `keepCopy` exports a PRIVATE
// trip back into this household FIRST — the "keep a copy" served by export, since promote
// was a MOVE. The shared trip lives on for the others (its `st_` blobs are NOT freed);
// the private copy gets its OWN re-copied `tn_`/`ts_` blobs.
//
//   POST /api/shared-trip-leave { sharedTripId, keepCopy? } -> { ok, id? }
//
// keepCopy semantics: notes come back member-unscoped (member_id NULL — attribution was a
// household, which doesn't map to a member); only THIS household's packing bags return,
// each bag_label exact-name re-matched to a current member (else the shared bag).

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ sharedTripId?: string; keepCopy?: boolean }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.sharedTripId)
  if (gate instanceof Response) return gate
  // The owner owns the trip's existence — leaving would orphan it. They dissolve instead.
  if (gate.membership.role === 'owner') return forbidden('Le propriétaire dissout le voyage plutôt que de le quitter.')

  let newTripId: string | null = null
  if (body?.keepCopy) newTripId = await exportPrivateCopy(ctx, actor.householdId, gate.trip)

  // Drop the grant. The unique index means the row exists; a future re-join un-revokes it.
  await ctx.env.DB.prepare(
    'UPDATE shared_trip_members SET revoked_at = ? WHERE shared_trip_id = ? AND household_id = ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), gate.trip.id, actor.householdId)
    .run()
  // Nudge the trip room so the other members' rosters drop this household; the leaver's own
  // household room is nudged by route.ts (keysForPath('shared-trip-leave') → trips/board/month).
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trips']])
  return ok({ ok: true, id: newTripId })
}, 'operator')

interface SharedTripMeta {
  id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  media_key: string | null
  colour: string
  notes: string | null
}

// Materialize a private household trip (+ notes + this household's packing) from the
// shared trip. Blobs are re-copied so the private copy is self-contained.
async function exportPrivateCopy(ctx: Ctx, householdId: string, trip: SharedTripMeta): Promise<string> {
  const notes = await ctx.env.DB.prepare(
    'SELECT category, label, text, media_kind, media_key, scene_key, date, position, created_at FROM shared_trip_notes WHERE shared_trip_id = ? AND deleted_at IS NULL',
  )
    .bind(trip.id)
    .all<{
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
    'SELECT bag_label, text, packed_at, position, created_at FROM shared_trip_packing WHERE shared_trip_id = ? AND household_id = ? AND deleted_at IS NULL',
  )
    .bind(trip.id, householdId)
    .all<{ bag_label: string | null; text: string; packed_at: number | null; position: number; created_at: number }>()
  const memberRows = await ctx.env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
    .bind(householdId)
    .all<{ id: string; display_name: string }>()
  const members = memberRows.results.map((m) => ({ id: m.id, displayName: m.display_name }))

  const tripId = newId()
  const ts = nowSec()
  // Re-copy the cover into a household-owned blob (the share keeps its own `st_` copy).
  const newCover = await copyR2Blob(ctx.env.PHOTOS, trip.media_key, 'tn')
  const inserts: D1PreparedStatement[] = [
    ctx.env.DB.prepare(
      'INSERT INTO trips (id, household_id, title, destination, start_at, end_at, members, media_kind, media_key, colour, notes, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    ).bind(
      tripId,
      householdId,
      trip.title,
      trip.destination,
      trip.start_at,
      trip.end_at,
      '[]', // members JSON — a fresh private trip starts with no member scoping
      newCover ? 'image' : null, // invariant: media_key set iff media_kind set
      newCover,
      trip.colour,
      trip.notes,
      ts,
    ),
  ]

  for (const n of notes.results) {
    const kind = n.media_kind === 'audio' || n.media_kind === 'drawing' || n.media_kind === 'image' ? n.media_kind : null
    const newKey = kind ? await copyR2Blob(ctx.env.PHOTOS, n.media_key, 'tn') : null
    const newScene = kind === 'drawing' ? await copyR2Blob(ctx.env.PHOTOS, n.scene_key, 'ts') : null
    inserts.push(
      ctx.env.DB.prepare(
        'INSERT INTO trip_notes (id, household_id, trip_id, category, label, text, media_kind, media_key, scene_key, member_id, date, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
      ).bind(
        newId(),
        householdId,
        tripId,
        n.category,
        n.label,
        n.text,
        newKey ? kind : null, // invariant: media_key set iff media_kind set
        newKey,
        newScene,
        n.date,
        n.position,
        n.created_at,
      ),
    )
  }
  for (const p of packing.results) {
    inserts.push(
      ctx.env.DB.prepare(
        'INSERT INTO trip_packing (id, household_id, trip_id, member_id, text, packed_at, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        newId(),
        householdId,
        tripId,
        matchBagLabelToMember(p.bag_label, members), // exact-name re-match to a current member, else shared
        p.text,
        p.packed_at,
        p.position,
        p.created_at,
      ),
    )
  }
  for (let i = 0; i < inserts.length; i += 20) await ctx.env.DB.batch(inserts.slice(i, i + 20))
  return tripId
}
