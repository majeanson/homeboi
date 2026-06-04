import type { Env } from '../_lib/env'
import { badRequest, ok, readJson } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { newId, nowSec } from '../_lib/ids'

// Shared list: read open + recently-checked, add, toggle, delete. Both operator
// and kiosk can write — ticking a grocery item is exactly what the wall tablet
// is for. No score for clearing items (NFR-CALM): done is just done.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, text, source, checked_at FROM list_items WHERE household_id = ? ORDER BY checked_at IS NOT NULL, created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ items: results })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const body = await readJson<{ text?: string }>(ctx.request)
  const text = body?.text?.trim()
  if (!text) return badRequest('Texte requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO list_items (id, household_id, text, source, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, text, 'manual', nowSec())
    .run()
  return ok({ id, text })
}

// PATCH toggles checked; DELETE removes. Scoped to the household so a kiosk
// can't touch another household's rows even with a forged id.
export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string; checked?: boolean }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('UPDATE list_items SET checked_at = ? WHERE id = ? AND household_id = ?')
    .bind(body.checked ? nowSec() : null, body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM list_items WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}
