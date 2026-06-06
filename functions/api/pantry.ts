import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// "Low / out" only — never a full inventory (brief tenet 3). Marking something
// low both records it and drops it on the shared list. Clearing it removes the
// low flag (you bought it).
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, item, marked_at FROM pantry_low WHERE household_id = ? ORDER BY marked_at DESC',
  )
    .bind(actor.householdId)
    .all()
  return ok({ low: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ item?: string }>(ctx.request)
  const item = body?.item?.trim()
  if (!item) return badRequest('Aliment requis.')
  const ts = nowSec()
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO pantry_low (id, household_id, item, marked_at) VALUES (?, ?, ?, ?)').bind(
      newId(),
      actor.householdId,
      item,
      ts,
    ),
    ctx.env.DB.prepare(
      'INSERT INTO list_items (id, household_id, text, source, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(newId(), actor.householdId, item, 'pantry-low', ts),
  ])
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM pantry_low WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
})
