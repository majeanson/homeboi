import { badRequest, conflict, forbidden, notFound, ok, okWire, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { requireSharedTripMember, nudgeSharedTrip, householdName } from '../_lib/sharedTrip'
import type { Ctx } from '../_lib/env'
import type { Actor } from '../_lib/household'

// « Voyage partagé » → « Qui apporte quoi » (gear) + « Qui cuisine » (meals), migration
// 0154. ONE gesture for both: a shared row a household CLAIMS. Unlike Bagages (each
// household's own bags, the others read-only), these rows belong to the WHOLE trip —
// any member adds, renames or removes one — but a claim is a household's own word:
// you can take a free row and let go of your own, never take or drop someone else's.
//
//   GET    /api/shared-trip-claims?tripId=<id>  -> { claims }
//   POST   /api/shared-trip-claims              -> { tripId, kind, text?, date?, slot?, claim? } -> { id }
//   PATCH  /api/shared-trip-claims              -> { id, text?, claim? }   claim: true = mine, false = let go
//   DELETE /api/shared-trip-claims              -> { id }
//
// A meal is one per (trip, day, slot): a second POST on a live slot is 409 — the client
// shows the existing row, so this only fires on a race between two households.

interface ClaimRow {
  id: string
  shared_trip_id: string
  kind: 'gear' | 'meal'
  text: string
  date: number | null
  slot: 'breakfast' | 'lunch' | 'supper' | null
  household_id: string | null
  household_label: string | null
  author_household_id: string | null
  position: number
  created_at: number
  updated_at: number | null
}

const CLAIM_COLS =
  'id, shared_trip_id, kind, text, date, slot, household_id, household_label, author_household_id, position, created_at, updated_at'
const TEXT_CAP = 200
const SLOTS = new Set(['breakfast', 'lunch', 'supper'])

export const onRequestGet = authed(async (ctx, actor) => {
  const tripId = new URL(ctx.request.url).searchParams.get('tripId')?.trim()
  const gate = await requireSharedTripMember(ctx.env, actor, tripId)
  if (gate instanceof Response) return gate
  const rows = await ctx.env.DB.prepare(
    `SELECT ${CLAIM_COLS} FROM shared_trip_claims WHERE shared_trip_id = ? AND deleted_at IS NULL ORDER BY kind, date, position, created_at`,
  )
    .bind(gate.trip.id)
    .all<ClaimRow>()
  return okWire('shared-trip-claims', { claims: rows.results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    tripId?: string
    kind?: string
    text?: string
    date?: number
    slot?: string
    claim?: boolean
  }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.tripId)
  if (gate instanceof Response) return gate
  const kind = body?.kind === 'meal' ? 'meal' : body?.kind === 'gear' ? 'gear' : null
  if (!kind) return badRequest('kind requis.')
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, TEXT_CAP) : ''

  let date: number | null = null
  let slot: string | null = null
  if (kind === 'gear') {
    if (!text) return badRequest('Texte requis.')
  } else {
    if (typeof body?.date !== 'number' || !Number.isFinite(body.date)) return badRequest('date requise.')
    if (typeof body?.slot !== 'string' || !SLOTS.has(body.slot)) return badRequest('slot invalide.')
    date = body.date
    slot = body.slot
    const taken = await ctx.env.DB.prepare(
      "SELECT id FROM shared_trip_claims WHERE shared_trip_id = ? AND kind = 'meal' AND date = ? AND slot = ? AND deleted_at IS NULL",
    )
      .bind(gate.trip.id, date, slot)
      .first<{ id: string }>()
    if (taken) return conflict('Ce repas est déjà prévu.')
  }

  const id = newId()
  const ts = nowSec()
  // A new row may be claimed in the same gesture (« Je cuisine » on an empty supper,
  // « Je l'apporte » typed straight into the gear list).
  const claimed = body?.claim === true
  const label = claimed ? await householdName(ctx.env, actor.householdId) : null
  await ctx.env.DB.prepare(
    'INSERT INTO shared_trip_claims (id, shared_trip_id, kind, text, date, slot, household_id, household_label, author_household_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
  )
    .bind(id, gate.trip.id, kind, text, date, slot, claimed ? actor.householdId : null, label, actor.householdId, ts)
    .run()
  nudgeSharedTrip(ctx, gate.trip.id, [['shared-trip-claims']])
  return ok({ ok: true, id })
}, 'operator')

// Read a live claim row and gate on its trip's membership.
async function liveRow(ctx: Ctx, actor: Actor, id: string | undefined): Promise<ClaimRow | Response> {
  const clean = id?.trim()
  if (!clean) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(`SELECT ${CLAIM_COLS} FROM shared_trip_claims WHERE id = ? AND deleted_at IS NULL`)
    .bind(clean)
    .first<ClaimRow>()
  if (!row) return notFound('Introuvable.')
  const gate = await requireSharedTripMember(ctx.env, actor, row.shared_trip_id)
  if (gate instanceof Response) return gate
  return row
}

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; text?: string; claim?: boolean }>(ctx.request)
  const row = await liveRow(ctx, actor, body?.id)
  if (row instanceof Response) return row
  const ts = nowSec()

  if (typeof body?.claim === 'boolean') {
    if (body.claim) {
      // Take a FREE row (or re-take one's own). Someone else's claim is theirs to drop.
      if (row.household_id && row.household_id !== actor.householdId) return forbidden('Une autre maisonnée s’en occupe déjà.')
      const label = await householdName(ctx.env, actor.householdId)
      // The `household_id IS NULL OR = me` predicate makes a simultaneous claim by two
      // households land once: the loser's UPDATE matches nothing → 409.
      const res = await ctx.env.DB.prepare(
        'UPDATE shared_trip_claims SET household_id = ?, household_label = ?, updated_at = ? WHERE id = ? AND (household_id IS NULL OR household_id = ?)',
      )
        .bind(actor.householdId, label, ts, row.id, actor.householdId)
        .run()
      if (!res.meta.changes) return conflict('Une autre maisonnée s’en occupe déjà.')
    } else {
      if (row.household_id !== actor.householdId) return forbidden('Seule la maisonnée qui s’en occupe peut le laisser.')
      await ctx.env.DB.prepare(
        'UPDATE shared_trip_claims SET household_id = NULL, household_label = NULL, updated_at = ? WHERE id = ? AND household_id = ?',
      )
        .bind(ts, row.id, actor.householdId)
        .run()
    }
  }
  if (typeof body?.text === 'string') {
    const text = body.text.trim().slice(0, TEXT_CAP)
    if (!text && row.kind === 'gear') return badRequest('Texte requis.')
    await ctx.env.DB.prepare('UPDATE shared_trip_claims SET text = ?, updated_at = ? WHERE id = ?').bind(text, ts, row.id).run()
  }
  nudgeSharedTrip(ctx, row.shared_trip_id, [['shared-trip-claims']])
  return ok({ ok: true })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const row = await liveRow(ctx, actor, body?.id)
  if (row instanceof Response) return row
  // A row someone else has taken on is theirs: removing it would erase their word
  // without asking. They let go first (or remove it themselves).
  if (row.household_id && row.household_id !== actor.householdId) return forbidden('Une autre maisonnée s’en occupe.')
  await ctx.env.DB.prepare('UPDATE shared_trip_claims SET deleted_at = ? WHERE id = ?').bind(nowSec(), row.id).run()
  nudgeSharedTrip(ctx, row.shared_trip_id, [['shared-trip-claims']])
  return ok({ ok: true })
}, 'operator')
