import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// The operator's active share-links — list + revoke (REVIEW-PASS §509). Guest tokens
// are stateless HMAC capabilities; the `guests` row (migration 0098, written at mint by
// guest/start.ts) is what makes a leaked/over-shared link killable before its TTL.
// resolveActor rejects a token whose row is revoked, so a revoke here kills the link's
// reads AND writes at once. Operator-only (a kiosk/guest can't manage access).

// List this household's still-LIVE links (not revoked, not yet expired), newest first —
// exactly the set worth showing a "revoke" button next to. Expired ones are already dead.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, kind, target_key, standing, label, created_at, expires_at
       FROM guests
      WHERE household_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC`,
  )
    .bind(actor.householdId, nowSec())
    .all()
  return ok({ links: results })
}, 'operator')

// Revoke one link by its token id. Idempotent (the `revoked_at IS NULL` guard makes a
// double-revoke a no-op) and household-scoped (an operator can only kill their own).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ revokeId?: string }>(ctx.request)
  if (!body?.revokeId) return badRequest('revokeId requis.')
  await ctx.env.DB.prepare(
    'UPDATE guests SET revoked_at = ? WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), body.revokeId, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
