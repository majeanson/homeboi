import { badRequest, forbidden, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { issueSharedTripInvite, SHARED_TRIP_INVITE_TTL } from '../_lib/auth'
import { requireSharedTripMember } from '../_lib/sharedTrip'

// « Voyage partagé » invite link. The link is a stateless HMAC capability
// (issueSharedTripInvite → `{st, n, x}`, signed with SESSION_SECRET) baked with the
// trip's current `invite_nonce`; there is NO invite DB row. Rotating the nonce
// (« Réinitialiser le lien ») invalidates every outstanding link at once.
//
//   POST   /api/shared-trip-invite  { sharedTripId }  -> { url, expiresAt }   (any member)
//   DELETE /api/shared-trip-invite  { sharedTripId }  -> rotate the nonce      (owner only)
//
// SILENT in realtime (see _lib/realtime SILENT_PATHS): the link is returned inline and
// no polled cache changes.

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ sharedTripId?: string }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.sharedTripId)
  if (gate instanceof Response) return gate
  // Any member can share the link (they're all trusted operators on the trip).
  const token = await issueSharedTripInvite(ctx.env, gate.trip.id, gate.trip.invite_nonce)
  const origin = new URL(ctx.request.url).origin
  return ok({ url: `${origin}/voyage/rejoindre?j=${token}`, expiresAt: nowSec() + SHARED_TRIP_INVITE_TTL })
}, 'operator')

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ sharedTripId?: string }>(ctx.request)
  const gate = await requireSharedTripMember(ctx.env, actor, body?.sharedTripId)
  if (gate instanceof Response) return gate
  // Only the owner household rotates the link (a destructive share-wide action).
  if (gate.membership.role !== 'owner') return forbidden('Seul le propriétaire peut réinitialiser le lien.')
  if (!body?.sharedTripId) return badRequest('sharedTripId requis.')
  await ctx.env.DB.prepare('UPDATE shared_trips SET invite_nonce = ?, updated_at = ? WHERE id = ?')
    .bind(newId(), nowSec(), gate.trip.id)
    .run()
  return ok({ ok: true })
}, 'operator')
