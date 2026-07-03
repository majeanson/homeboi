// « Voyage partagé » plumbing — the shared-trip counterpart of household.ts's
// requireActor + route.ts's broadcast hook. A shared trip lives in NEITHER
// household (capability-scoped store, migration 0101), so authed() still resolves
// the actor against their OWN household; authorization for the shared trip is a
// SECOND check here: a live shared_trip_members row. Handlers call
// requireSharedTripMember() right after authed() hands them the actor.

import type { Ctx, Env } from './env'
import type { Actor } from './household'
import { forbidden, notFound } from './json'
import { broadcastInvalidate } from './realtime'

// Product decision (locked): at most 6 households share one trip. Enforced
// server-side at join (shared-trip-join counts live memberships).
export const MAX_SHARED_HOUSEHOLDS = 6

export interface SharedTripRow {
  id: string
  owner_household_id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
  invite_nonce: string
  position: number
  created_at: number
  updated_at: number | null
}

export interface SharedTripMemberRow {
  id: string
  shared_trip_id: string
  household_id: string
  role: string
  label: string
  colour: string
  joined_at: number
  revoked_at: number | null
  created_at: number
}

export const SHARED_TRIP_COLS =
  'id, owner_household_id, title, destination, start_at, end_at, media_kind, media_key, colour, notes, invite_nonce, position, created_at, updated_at'
const SHARED_TRIP_MEMBER_COLS =
  'id, shared_trip_id, household_id, role, label, colour, joined_at, revoked_at, created_at'

// Authorize a request against a shared trip: the trip must be live AND the actor's
// household must hold a live (un-revoked) membership. Returns the trip + membership,
// or a ready-to-return Response (404 the trip is gone/dissolved, 403 not a member) so
// the handler does the same `if (x instanceof Response) return x` dance as requireActor.
export async function requireSharedTripMember(
  env: Env,
  actor: Actor,
  sharedTripId: string | null | undefined,
): Promise<{ trip: SharedTripRow; membership: SharedTripMemberRow } | Response> {
  const id = sharedTripId?.trim()
  if (!id) return notFound('Voyage introuvable.')
  const trip = await env.DB.prepare(`SELECT ${SHARED_TRIP_COLS} FROM shared_trips WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<SharedTripRow>()
  if (!trip) return notFound('Voyage introuvable.')
  const membership = await env.DB.prepare(
    `SELECT ${SHARED_TRIP_MEMBER_COLS} FROM shared_trip_members WHERE shared_trip_id = ? AND household_id = ? AND revoked_at IS NULL`,
  )
    .bind(id, actor.householdId)
    .first<SharedTripMemberRow>()
  if (!membership) return forbidden('Tu ne fais pas partie de ce voyage.')
  return { trip, membership }
}

// The household's display name (family-share reads the same `households.name`), used as
// the attribution snapshot: a membership `label` at (re)join and a note's `author_label`
// at write time (the postbox free-text-name rule — survives the household leaving). Falls
// back to a neutral label so attribution is never blank.
export async function householdName(env: Env, householdId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT name FROM households WHERE id = ?')
    .bind(householdId)
    .first<{ name: string | null }>()
  return row?.name?.trim() || 'Une maisonnée'
}

// Nudge the shared trip's realtime room (DO name `st:<id>`, not a household id) so
// every other household with the page open refetches at once. Best-effort + fail-safe
// (broadcastInvalidate swallows everything); runs after the response flushes via
// waitUntil, falling back to fire-and-forget in a unit-test ctx — mirrors the hook in
// route.ts. Polling stays the correctness fallback if the DO is unset.
export function nudgeSharedTrip(ctx: Ctx, sharedTripId: string, keys: string[][]): void {
  const fire = broadcastInvalidate(ctx.env, `st:${sharedTripId}`, keys)
  if (typeof ctx.waitUntil === 'function') ctx.waitUntil(fire)
  else void fire
}

// ---- Pure promote/export bag-label mapping ---------------------------------
//
// Promote MOVES a private trip into the shared store. Private packing is scoped by
// `member_id` (a household member); the shared store has no member ids (they never
// cross households), so each private bag becomes a free-text `bag_label` = that
// member's display name. NULL member_id (the household's shared bag) stays NULL.
// A member that no longer exists (a stale soft ref) also falls back to the shared bag.
export function mapPackingMemberToBagLabel(
  memberId: string | null | undefined,
  memberNames: Map<string, string>,
): string | null {
  const id = memberId?.trim()
  if (!id) return null
  return memberNames.get(id) ?? null
}

// Leave-with-a-copy exports the shared trip back to a PRIVATE trip. A shared bag's
// `bag_label` (a free-text name) is re-matched to one of the leaver's CURRENT members
// by an EXACT name match (the postbox attribution rule — never a fuzzy guess); no match
// → NULL (the private trip's shared bag). Comparison is trim + case-insensitive so a
// label round-trips through the promote→export cycle regardless of stored casing.
export function matchBagLabelToMember(
  bagLabel: string | null | undefined,
  members: { id: string; displayName: string }[],
): string | null {
  const wanted = bagLabel?.trim().toLocaleLowerCase()
  if (!wanted) return null
  const hit = members.find((m) => m.displayName.trim().toLocaleLowerCase() === wanted)
  return hit ? hit.id : null
}
