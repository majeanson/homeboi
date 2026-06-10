import { badRequest, forbidden, notFound, ok, parseJsonArray, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { dayStart, newId, nowSec } from '../_lib/ids'

// Kid-view visual routines. GET returns each routine with TODAY's completion
// set (which resets daily — the day empties, NFR-CALM-4). POST creates a
// routine (operator). PATCH toggles one card done for today (kiosk-friendly:
// the three-year-old taps it) — or, operator-only, retags the routine's
// time-of-day cue.
interface Card {
  icon: string
  label: string
  narration?: string
}

const isNumber = (v: unknown): v is number => typeof v === 'number'
// The time-of-day cue ('morning'|'afternoon'|'evening'); anything else → null
// (anytime). An ordering hint for the kid view, never a gate.
const todOrNull = (v: unknown): string | null =>
  v === 'morning' || v === 'afternoon' || v === 'evening' ? v : null

export const onRequestGet = authed(async (ctx, actor) => {
  const today = dayStart(new Date(Date.now()))

  const routines = await ctx.env.DB.prepare(
    `SELECT r.id, r.member_id, r.name, r.cards_json, r.time_of_day, m.display_name AS member_name,
            m.colour AS color, m.avatar_kind AS avatar_kind, m.avatar_ref AS avatar_photo
       FROM routines r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.household_id = ? ORDER BY r.created_at`,
  )
    .bind(actor.householdId)
    .all<{
      id: string
      member_id: string
      name: string
      cards_json: string
      time_of_day: string | null
      member_name: string | null
      color: string | null
      avatar_kind: string | null
      avatar_photo: string | null
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
    avatarPhoto: r.avatar_kind === 'photo' ? r.avatar_photo : null,
    name: r.name,
    timeOfDay: todOrNull(r.time_of_day),
    cards: parseJsonArray<Card>(r.cards_json),
    doneIdx: parseJsonArray<number>(doneByRoutine.get(r.id), isNumber),
  }))
  return ok({ routines: out, date: today })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    memberId?: string
    memberIds?: string[]
    name?: string
    cards?: Card[]
    timeOfDay?: string
  }>(ctx.request)
  // One routine can be assigned to several toddlers at once (e.g. the SAME
  // bedtime for two kids). We create one routine row PER child with the same
  // deck, so each toddler gets independent daily completion — Maya ticking her
  // teeth doesn't tick Léo's. Accepts memberIds[]; falls back to a single
  // memberId for older callers.
  const memberIds = (body?.memberIds?.length ? body.memberIds : body?.memberId ? [body.memberId] : [])
    .filter((m): m is string => typeof m === 'string' && m.length > 0)
    .slice(0, 8)
  if (!memberIds.length || !body?.name?.trim()) return badRequest('memberId(s) + nom requis.')
  const cards = (body.cards ?? []).slice(0, 12)
  const name = body.name.trim()
  const cardsJson = JSON.stringify(cards)
  const tod = todOrNull(body.timeOfDay)
  const ts = nowSec()
  const ids = memberIds.map(() => newId())
  await ctx.env.DB.batch(
    memberIds.map((memberId, i) =>
      ctx.env.DB.prepare(
        'INSERT INTO routines (id, household_id, member_id, name, cards_json, time_of_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(ids[i], actor.householdId, memberId, name, cardsJson, tod, ts),
    ),
  )
  return ok({ ids })
}, 'operator')

// PATCH wears two hats: toggle a card done for today (the toddler's tap —
// kiosk-allowed), or retag the routine's time-of-day cue (operator-only).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ routineId?: string; cardIdx?: number; done?: boolean; timeOfDay?: string | null }>(
    ctx.request,
  )
  if (!body?.routineId) return badRequest('routineId requis.')

  // Ownership check: the routine must belong to this household.
  const owns = await ctx.env.DB.prepare('SELECT id FROM routines WHERE id = ? AND household_id = ?')
    .bind(body.routineId, actor.householdId)
    .first<{ id: string }>()
  if (!owns) return notFound('Routine introuvable.')

  // Retag the cue — a settings act, not a toddler tap, so operator-only.
  if (body.cardIdx === undefined) {
    if (!('timeOfDay' in body)) return badRequest('cardIdx ou timeOfDay requis.')
    if (actor.scope !== 'operator') return forbidden('This action needs the operator account, not a kiosk.')
    await ctx.env.DB.prepare('UPDATE routines SET time_of_day = ? WHERE id = ? AND household_id = ?')
      .bind(todOrNull(body.timeOfDay), body.routineId, actor.householdId)
      .run()
    return ok({ ok: true })
  }

  if (typeof body.cardIdx !== 'number') return badRequest('routineId + cardIdx requis.')

  const today = dayStart(new Date(Date.now()))
  const existing = await ctx.env.DB.prepare(
    'SELECT done_idx_json FROM routine_runs WHERE routine_id = ? AND date = ?',
  )
    .bind(body.routineId, today)
    .first<{ done_idx_json: string }>()

  const set = new Set(parseJsonArray<number>(existing?.done_idx_json, isNumber))
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
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (!body?.id) return badRequest('id requis.')
  // routine_runs.routine_id FK-references this routine, so D1 blocks the delete
  // until the daily runs are gone. Clear them first in one transaction. Runs are
  // scoped through the routine's own household guard, so a wrong household can't
  // wipe another's runs.
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'DELETE FROM routine_runs WHERE routine_id IN (SELECT id FROM routines WHERE id = ? AND household_id = ?)',
    ).bind(body.id, actor.householdId),
    ctx.env.DB.prepare('DELETE FROM routines WHERE id = ? AND household_id = ?').bind(
      body.id,
      actor.householdId,
    ),
  ])
  return ok({ ok: true })
}, 'operator')
