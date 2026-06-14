import { badRequest, ok, readJson } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { nowSec } from '../../_lib/ids'

// List paired tablets (operator) and revoke one. Revocation is the whole
// reason device-pairing beats a static capability URL: a lost tablet is killed
// here without touching anyone else's access.
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, label, created_at, last_seen_at, revoked_at
       FROM devices WHERE household_id = ? ORDER BY created_at DESC`,
  )
    .bind(actor.householdId)
    .all()
  return ok({ devices: results })
}, 'operator')

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ revokeId?: string }>(ctx.request)
  if (!body?.revokeId) return badRequest('revokeId requis.')
  await ctx.env.DB.prepare(
    'UPDATE devices SET revoked_at = ? WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
  )
    .bind(nowSec(), body.revokeId, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')

// Rename a paired tablet (operator) — the only editable field a device has, so
// "Tablette du salon" stops being whatever label was typed at pairing time.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; label?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  const label = body.label?.trim()
  if (!label) return badRequest('label requis.')
  await ctx.env.DB.prepare('UPDATE devices SET label = ? WHERE id = ? AND household_id = ?')
    .bind(label.slice(0, 60), body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}, 'operator')
