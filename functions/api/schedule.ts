import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// Work / recurring-schedule blocks for « L'auto » (migration 0069). The quiet weekly
// backdrop that shapes when the shared car is spoken for — one member's recurring
// window (Mon–Fri 8h–17h…), optionally holding the car. NOT agenda events: they feed
// the car-availability resolver + the derived "who's home" glance, never the board.
//
//   GET    /api/schedule  -> { blocks: ScheduleBlock[] } (whole household)
//   POST   /api/schedule  -> create { memberId, label?, startMin, endMin, weekdays[], holdsCar?, color? }
//   PATCH  /api/schedule  -> edit one { id, ...same fields }
//   DELETE /api/schedule  -> remove one { id }
//
// Open to any authed actor (a parent-mode kiosk may tune household schedules, like
// meal/reserve prefs); guests are blocked from writes centrally by authed().

interface BlockRow {
  id: string
  member_id: string
  label: string | null
  start_min: number
  end_min: number
  weekdays: string
  holds_car: number
  color: string | null
}

// Client-facing camelCase shape (matches _lib/carResolve.ScheduleBlock). A NEW
// endpoint, so we return clean camelCase + a parsed weekday array rather than raw
// snake_case rows — nothing else reads these rows as snake_case.
const toClient = (r: BlockRow) => {
  let weekdays: number[] = []
  try {
    const v = JSON.parse(r.weekdays)
    if (Array.isArray(v)) weekdays = v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
  } catch {
    weekdays = []
  }
  return {
    id: r.id,
    memberId: r.member_id,
    label: r.label,
    startMin: r.start_min,
    endMin: r.end_min,
    weekdays,
    holdsCar: r.holds_car === 1,
    color: r.color,
  }
}

const MAX_MIN = 24 * 60
// Clamp a minute-of-day to [0, 1440]; non-finite → null (caller rejects).
const minute = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), MAX_MIN) : null
}
const cleanWeekdays = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b) : []

interface Body {
  id?: string
  memberId?: string
  label?: string | null
  startMin?: unknown
  endMin?: unknown
  weekdays?: unknown
  holdsCar?: boolean
  color?: string | null
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, member_id, label, start_min, end_min, weekdays, holds_car, color FROM schedule_blocks WHERE household_id = ? ORDER BY start_min',
  )
    .bind(actor.householdId)
    .all<BlockRow>()
  return ok({ blocks: results.map(toClient) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const memberId = body?.memberId?.trim()
  const startMin = minute(body?.startMin)
  const endMin = minute(body?.endMin)
  if (!memberId || startMin == null || endMin == null || endMin <= startMin) {
    return badRequest('Membre + plage horaire valide requis.')
  }
  const id = newId()
  await ctx.env.DB.prepare(
    'INSERT INTO schedule_blocks (id, household_id, member_id, label, start_min, end_min, weekdays, holds_car, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      actor.householdId,
      memberId,
      body?.label?.trim().slice(0, 60) || null,
      startMin,
      endMin,
      JSON.stringify(cleanWeekdays(body?.weekdays)),
      body?.holdsCar === false ? 0 : 1,
      isHex(body?.color) ? body!.color!.toLowerCase() : null,
      nowSec(),
    )
    .run()
  return ok({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const id = body?.id?.trim()
  const memberId = body?.memberId?.trim()
  const startMin = minute(body?.startMin)
  const endMin = minute(body?.endMin)
  if (!id || !memberId || startMin == null || endMin == null || endMin <= startMin) {
    return badRequest('id + membre + plage horaire valide requis.')
  }
  const res = await ctx.env.DB.prepare(
    'UPDATE schedule_blocks SET member_id = ?, label = ?, start_min = ?, end_min = ?, weekdays = ?, holds_car = ?, color = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      memberId,
      body?.label?.trim().slice(0, 60) || null,
      startMin,
      endMin,
      JSON.stringify(cleanWeekdays(body?.weekdays)),
      body?.holdsCar === false ? 0 : 1,
      isHex(body?.color) ? body!.color!.toLowerCase() : null,
      id,
      actor.householdId,
    )
    .run()
  if (!res.meta.changes) return notFound('Horaire introuvable.')
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = body?.id?.trim()
  if (!id) return badRequest('id requis.')
  await ctx.env.DB.prepare('DELETE FROM schedule_blocks WHERE id = ? AND household_id = ?')
    .bind(id, actor.householdId)
    .run()
  return ok({ ok: true })
})
