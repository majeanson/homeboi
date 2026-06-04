import type { Env } from '../_lib/env'
import { badRequest, ok, readJson } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { newId, nowSec } from '../_lib/ids'

// Household members. Read is open to the kiosk (the board needs faces +
// "pick your face" attribution); create/delete is operator-only.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, display_name, avatar_kind, avatar_ref, is_child, sort_order FROM members WHERE household_id = ? ORDER BY sort_order, created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ members: results })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ name?: string; color?: string; isChild?: boolean }>(ctx.request)
  const name = body?.name?.trim()
  if (!name) return badRequest('Nom requis.')
  const id = newId()
  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color ?? '') ? body!.color! : '#7a8b6f'
  await ctx.env.DB.prepare(
    'INSERT INTO members (id, household_id, display_name, avatar_kind, avatar_ref, is_child, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, name, 'color', color, body?.isChild ? 1 : 0, nowSec())
    .run()
  return ok({ id, name })
}

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM members WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}
