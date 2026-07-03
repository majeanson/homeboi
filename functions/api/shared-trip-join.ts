import { forbidden, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { verifySharedTripInvite } from '../_lib/auth'
import { MAX_SHARED_HOUSEHOLDS, nudgeSharedTrip, householdName } from '../_lib/sharedTrip'
import type { Env } from '../_lib/env'

// « Voyage partagé » join. The invite token IS the capability (verifySharedTripInvite),
// so neither call requires an existing membership — only a signed-in operator. The
// token's nonce must still match the trip's LIVE invite_nonce, so a rotated link is dead.
//
//   GET  /api/shared-trip-join?j=<token>  -> preview { title, destination, start_at, end_at, members }
//   POST /api/shared-trip-join { token }  -> join (cap 6) -> { id }
//
// POST upserts: a brand-new household inserts (subject to the 6-household cap); a household
// that previously LEFT (revoked) un-revokes, refreshing joined_at + its label snapshot.

interface JoinTripRow {
  id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  invite_nonce: string
}

// Verify the token AND that its nonce still matches the live trip. Returns the trip row
// or a ready-to-return Response (the same shape family-share's guarded reads use).
async function resolveInvite(
  env: Env,
  token: string | null | undefined,
): Promise<JoinTripRow | Response> {
  const payload = await verifySharedTripInvite(env, token ?? null)
  if (!payload) return notFound('Ce lien n’est plus valide.')
  const trip = await env.DB.prepare(
    'SELECT id, title, destination, start_at, end_at, invite_nonce FROM shared_trips WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(payload.sharedTripId)
    .first<JoinTripRow>()
  // A missing trip OR a nonce that no longer matches (« Réinitialiser le lien » rotated
  // it) both mean the link is dead — the nonce comparison happens HERE, not in verify.
  if (!trip || trip.invite_nonce !== payload.nonce) return notFound('Ce lien n’est plus valide.')
  return trip
}

async function liveMemberCount(env: import('../_lib/env').Env, sharedTripId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM shared_trip_members WHERE shared_trip_id = ? AND revoked_at IS NULL',
  )
    .bind(sharedTripId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export const onRequestGet = authed(async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get('j')
  const trip = await resolveInvite(ctx.env, token)
  if (trip instanceof Response) return trip
  return ok({
    title: trip.title,
    destination: trip.destination,
    start_at: trip.start_at,
    end_at: trip.end_at,
    members: await liveMemberCount(ctx.env, trip.id),
  })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ token?: string }>(ctx.request)
  const trip = await resolveInvite(ctx.env, body?.token)
  if (trip instanceof Response) return trip
  const ts = nowSec()
  const label = await householdName(ctx.env, actor.householdId)

  // Idempotent upsert on the (shared_trip_id, household_id) unique index.
  const existing = await ctx.env.DB.prepare(
    'SELECT id, revoked_at FROM shared_trip_members WHERE shared_trip_id = ? AND household_id = ?',
  )
    .bind(trip.id, actor.householdId)
    .first<{ id: string; revoked_at: number | null }>()

  if (existing && existing.revoked_at == null) {
    // Already a live member — nothing to do (a re-clicked link is harmless).
    return ok({ id: trip.id })
  }

  // A fresh join OR an un-revoke both ADD a live grant, so both are gated by the cap.
  if ((await liveMemberCount(ctx.env, trip.id)) >= MAX_SHARED_HOUSEHOLDS) {
    return forbidden('Ce voyage a atteint le maximum de maisonnées.')
  }

  if (existing) {
    // Rejoin: un-revoke, refresh joined_at + the label snapshot (revoked→live).
    await ctx.env.DB.prepare(
      'UPDATE shared_trip_members SET revoked_at = NULL, joined_at = ?, label = ? WHERE id = ?',
    )
      .bind(ts, label, existing.id)
      .run()
  } else {
    await ctx.env.DB.prepare(
      "INSERT INTO shared_trip_members (id, shared_trip_id, household_id, role, label, joined_at, created_at) VALUES (?, ?, ?, 'member', ?, ?, ?)",
    )
      .bind(newId(), trip.id, actor.householdId, label, ts, ts)
      .run()
  }
  // Nudge the trip room so every other member's roster refreshes; the joiner's own
  // household room is nudged by the route.ts hook (keysForPath('shared-trip-join')).
  nudgeSharedTrip(ctx, trip.id, [['shared-trips']])
  return ok({ id: trip.id })
}, 'operator')
