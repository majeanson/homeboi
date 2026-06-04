import type { Env } from '../../_lib/env'
import { badRequest, ok, readJson } from '../../_lib/json'
import { requireActor } from '../../_lib/household'
import { nowSec } from '../../_lib/ids'

// List paired tablets (operator) and revoke one. Revocation is the whole
// reason device-pairing beats a static capability URL: a lost tablet is killed
// here without touching anyone else's access.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, label, created_at, last_seen_at, revoked_at
       FROM devices WHERE household_id = ? ORDER BY created_at DESC`,
  )
    .bind(actor.householdId)
    .all()
  return ok({ devices: results })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ revokeId?: string }>(ctx.request)
  if (!body?.revokeId) return badRequest('revokeId requis.')
  await ctx.env.DB.prepare(
    'UPDATE devices SET revoked_at = ? WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), body.revokeId, actor.householdId)
    .run()
  return ok({ ok: true })
}
