import type { Env } from '../_lib/env'
import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { requireActor } from '../_lib/household'
import { dayStart, newId, nowSec } from '../_lib/ids'

// Kid-view visual routines. GET returns each routine with TODAY's completion
// set (which resets daily — the day empties, NFR-CALM-4). POST creates a
// routine (operator). PATCH toggles one card done for today (kiosk-friendly:
// the three-year-old taps it).
interface Card {
  icon: string
  label: string
  narration?: string
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const today = dayStart(new Date(Date.now()))

  const routines = await ctx.env.DB.prepare(
    `SELECT r.id, r.member_id, r.name, r.cards_json, m.display_name AS member_name, m.avatar_ref AS color
       FROM routines r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.household_id = ? ORDER BY r.created_at`,
  )
    .bind(actor.householdId)
    .all<{
      id: string
      member_id: string
      name: string
      cards_json: string
      member_name: string | null
      color: string | null
    }>()

  // Today's runs in one query, keyed by routine.
  const runs = await ctx.env.DB.prepare(
    `SELECT routine_id, done_idx_json FROM routine_runs
      WHERE date = ? AND routine_id IN (SELECT id FROM routines WHERE household_id = ?)`,
  )
    .bind(today, actor.householdId)
    .all<{ routine_id: string; done_idx_json: string }>()
  const doneByRoutine = new Map(runs.results.map((r) => [r.routine_id, r.done_idx_json]))

  const out = routines.results.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name,
    color: r.color,
    name: r.name,
    cards: safeCards(r.cards_json),
    doneIdx: safeIdx(doneByRoutine.get(r.id)),
  }))
  return ok({ routines: out, date: today })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ memberId?: string; name?: string; cards?: Card[] }>(ctx.request)
  if (!body?.memberId || !body.name?.trim()) return badRequest('memberId + nom requis.')
  const cards = (body.cards ?? []).slice(0, 12)
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO routines (id, household_id, member_id, name, cards_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, body.memberId, body.name.trim(), JSON.stringify(cards), nowSec())
    .run()
  return ok({ id })
}

// Toggle a single card index done for today. Upserts the daily run row.
export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request)
  if (actor instanceof Response) return actor
  const body = await readJson<{ routineId?: string; cardIdx?: number; done?: boolean }>(ctx.request)
  if (!body?.routineId || typeof body.cardIdx !== 'number') return badRequest('routineId + cardIdx requis.')

  // Ownership check: the routine must belong to this household.
  const owns = await ctx.env.DB.prepare('SELECT id FROM routines WHERE id = ? AND household_id = ?')
    .bind(body.routineId, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return notFound('Routine introuvable.')

  const today = dayStart(new Date(Date.now()))
  const existing = await ctx.env.DB.prepare(
    'SELECT done_idx_json FROM routine_runs WHERE routine_id = ? AND date = ?',
  )
    .bind(body.routineId, today)
    .first<{ done_idx_json: string }>()

  const set = new Set(safeIdx(existing?.done_idx_json))
  if (body.done === false) set.delete(body.cardIdx)
  else set.add(body.cardIdx)
  const json = JSON.stringify([...set])
  const ts = nowSec()

  if (existing) {
    await ctx.env.DB.prepare('UPDATE routine_runs SET done_idx_json = ?, updated_at = ? WHERE routine_id = ? AND date = ?')
      .bind(json, ts, body.routineId, today)
      .run()
  } else {
    await ctx.env.DB.prepare(
      'INSERT INTO routine_runs (id, routine_id, date, done_idx_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(newId(), body.routineId, today, json, ts)
      .run()
  }
  return ok({ doneIdx: [...set] })
}

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const actor = await requireActor(ctx.env, ctx.request, 'operator')
  if (actor instanceof Response) return actor
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM routines WHERE id = ? AND household_id = ?')
    .bind(body.id, actor.householdId)
    .run()
  return ok({ ok: true })
}

function safeCards(json: string): Card[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function safeIdx(json: string | undefined): number[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : []
  } catch {
    return []
  }
}
