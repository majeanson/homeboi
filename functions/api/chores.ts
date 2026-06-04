import type { Env } from '../_lib/env'
import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { newId, nowSec } from '../_lib/ids'

// Chores with a round-robin rotation. The ONLY "credit" that exists is
// last_done_by + whose-turn — no points, no streak (NFR-CALM-1). Marking done
// advances the rotation and stamps who/when.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, rotation_json, current_idx, last_done_at, last_done_by FROM tasks WHERE household_id = ? ORDER BY created_at',
  )
    .bind(actor.householdId)
    .all()
  return ok({ chores: results })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ title?: string; rotation?: string[] }>(ctx.request)
  const title = body?.title?.trim()
  if (!title) return badRequest('Titre requis.')
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO tasks (id, household_id, title, rotation_json, current_idx, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  )
    .bind(id, actor.householdId, title, JSON.stringify(body?.rotation ?? []), nowSec())
    .run()
  return ok({ id, title })
}

// Mark done: stamp the current person, then advance the rotation. Both kiosk
// and operator can do this (tap-to-complete on the wall).
export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')

  const chore = await ctx.env.DB.prepare(
    'SELECT rotation_json, current_idx FROM tasks WHERE id = ? AND household_id = ?',
  )
    .bind(body.id, actor.householdId)
    .first<{ rotation_json: string; current_idx: number }>()
  if (!chore) return notFound('Corvée introuvable.')

  let rotation: string[] = []
  try {
    rotation = JSON.parse(chore.rotation_json)
  } catch {
    rotation = []
  }
  const doneBy = rotation.length ? rotation[chore.current_idx % rotation.length] : null
  const nextIdx = rotation.length ? (chore.current_idx + 1) % rotation.length : 0

  await ctx.env.DB.prepare(
    'UPDATE tasks SET last_done_at = ?, last_done_by = ?, current_idx = ? WHERE id = ? AND household_id = ?',
  )
    .bind(nowSec(), doneBy, nextIdx, body.id, actor.householdId)
    .run()
  return ok({ ok: true, nextIdx })
}

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}
