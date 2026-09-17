import { badRequest, notFound, ok, readJson, serviceUnavailable } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { requirePassword } from '../../_lib/sudo'
import { MAX_RESTORE_BYTES, restoreHousehold, validateTakeout } from '../../_lib/restore'

// POST /api/takeout/restore — the one restore door (STATE.md §4-L L8).
//   { password, source: 'backup', date }        a nightly copy from R2
//   { password, source: 'file', takeout }       the JSON « Emporter mes données » gave you
//
// Operator-only AND password-gated (_lib/sudo.ts): it REPLACES everything the household
// holds. Not in the outbox (write-rule ALLOWED with the reason): a restore replayed
// hours later would overwrite whatever was added since. SILENT in realtime — the client
// invalidates every query on success and other devices catch up on their next poll.
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ password?: string; source?: string; date?: string; takeout?: unknown }>(ctx.request)
  if (!body) return badRequest('Corps invalide.')
  const denied = await requirePassword(ctx.env, actor, body.password)
  if (denied) return denied

  let raw: unknown
  if (body.source === 'backup') {
    const date = typeof body.date === 'string' ? body.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest('Date invalide.')
    const bucket = ctx.env.PHOTOS
    if (!bucket) return serviceUnavailable('Aucune copie de nuit sur ce Babillard (R2 absent).')
    const obj = await bucket.get(`backup/${actor.householdId}/${date}.json`)
    if (!obj) return notFound('Cette copie n’existe pas.')
    if (obj.size > MAX_RESTORE_BYTES) return badRequest('Copie trop volumineuse.')
    raw = await obj.json()
  } else if (body.source === 'file') {
    raw = body.takeout
  } else {
    return badRequest('source: backup | file.')
  }

  const v = validateTakeout(raw)
  if (!v.ok) return badRequest(`Ce fichier n’est pas une copie Babillard (${v.error}).`)
  const summary = await restoreHousehold(ctx.env, actor.householdId, v.takeout)
  return ok({ ok: true, ...summary })
}, 'operator')
