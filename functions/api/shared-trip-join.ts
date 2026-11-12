import { forbidden, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { verifySharedTripInvite } from '../_lib/auth'
import { MAX_SHARED_HOUSEHOLDS, nudgeSharedTrip, householdName, previewAliases } from '../_lib/sharedTrip'
import type { Env } from '../_lib/env'

// « Voyage partagé » join. The invite token IS the capability (verifySharedTripInvite),
// so neither call requires an existing membership — the POST a signed-in operator, the GET
// nobody at all (a public preview). The
// token's nonce must still match the trip's LIVE invite_nonce, so a rotated link is dead.
//
//   GET  /api/shared-trip-join?j=<token>  -> PUBLIC preview: the whole trip, read-only (see below)
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

// The PREVIEW is public — deliberately NOT authed(), exactly like /api/share-public: the
// invite token IS the capability. A friend who has no Babillard yet opens the link from
// a group chat and sees the trip as a member would (itinerary, infos, bags, documents,
// « qui apporte quoi », « qui cuisine »), read-only, under a « Rejoindre » that walks them
// through signup and back here (Marc, 2026-11-12: « so they can see what it would look
// like »). Before this the GET was operator-only and a signed-out visitor was bounced to
// /login having seen nothing at all.
//
// Whoever holds the link could JOIN and read all of this anyway, so the preview widens
// nothing; it only lets them look before making an account. Household ids never leave
// the server: each household is an opaque alias (`h0`, `h1`…) the payload is consistent
// in, so a preview can't be used to learn a tenant id. A rotated link (new nonce) and a
// dissolved trip still answer 404 here, like the POST.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get('j')
  const trip = await resolveInvite(ctx.env, token)
  if (trip instanceof Response) return trip
  const db = ctx.env.DB
  const [meta, members, notes, packing, claims] = await Promise.all([
    db.prepare('SELECT colour, media_key FROM shared_trips WHERE id = ?').bind(trip.id).first<{ colour: string; media_key: string | null }>(),
    db
      .prepare('SELECT household_id, label, colour, role FROM shared_trip_members WHERE shared_trip_id = ? AND revoked_at IS NULL ORDER BY (role = \'owner\') DESC, joined_at')
      .bind(trip.id)
      .all<{ household_id: string; label: string; colour: string; role: string }>(),
    db
      .prepare(
        'SELECT id, category, label, text, media_kind, media_key, author_household_id, author_label, date, position, created_at FROM shared_trip_notes WHERE shared_trip_id = ? AND deleted_at IS NULL ORDER BY (date IS NULL), date, position, created_at DESC',
      )
      .bind(trip.id)
      .all<{ author_household_id: string | null } & Record<string, unknown>>(),
    db
      .prepare(
        'SELECT id, household_id, bag_label, text, position, created_at FROM shared_trip_packing WHERE shared_trip_id = ? AND deleted_at IS NULL AND packed_at IS NULL ORDER BY household_id, (bag_label IS NULL) DESC, bag_label, position, created_at',
      )
      .bind(trip.id)
      .all<{ household_id: string } & Record<string, unknown>>(),
    db
      .prepare(
        'SELECT id, kind, text, date, slot, household_id, household_label, position, created_at FROM shared_trip_claims WHERE shared_trip_id = ? AND deleted_at IS NULL ORDER BY kind, date, position, created_at',
      )
      .bind(trip.id)
      .all<{ household_id: string | null } & Record<string, unknown>>(),
  ])
  const alias = previewAliases(members.results.map((m) => m.household_id))
  const as = (id: string | null) => (id == null ? null : alias.get(id) ?? null)
  return ok({
    title: trip.title,
    destination: trip.destination,
    start_at: trip.start_at,
    end_at: trip.end_at,
    colour: meta?.colour ?? '#88a36f',
    media_key: meta?.media_key ?? null,
    members: members.results.length,
    households: members.results.map((m) => ({ id: as(m.household_id)!, label: m.label, colour: m.colour, role: m.role })),
    notes: notes.results.map((n) => ({ ...n, shared_trip_id: 'preview', author_household_id: as(n.author_household_id), scene_key: null, updated_at: null })),
    packing: packing.results.map((p) => ({ ...p, shared_trip_id: 'preview', household_id: as(p.household_id) ?? 'gone', packed_at: null })),
    claims: claims.results.map((c) => ({ ...c, shared_trip_id: 'preview', household_id: as(c.household_id), author_household_id: null, updated_at: null })),
  })
}

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
