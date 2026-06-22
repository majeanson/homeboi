import { badRequest, notFound, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec, localDayStart, localDayOfWeek } from '../_lib/ids'

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
  week_interval: number
  anchor_day: number | null
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
    weekInterval: r.week_interval ?? 1,
    anchorDay: r.anchor_day ?? null,
  }
}

// Repeat-every-N-weeks: 1 = every week (the default), capped at 8 (a two-month
// rota is the practical ceiling for a household shift). Garbage → 1.
const weekInterval = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 1
}
// The reference week an every-N-weeks block phases from: the START of the current
// LOCAL week (Sunday). Stamped server-side when a recurring (interval > 1) block is
// saved so the client never has to compute a DST-correct week boundary; weekly
// blocks (interval 1) store NULL — phasing is irrelevant.
const DAY = 86400
const currentWeekStart = (): number => {
  const today = localDayStart(new Date())
  return today - localDayOfWeek(new Date(today * 1000)) * DAY
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
  weekInterval?: unknown // repeat every N weeks (1 = every week)
  anchorDay?: unknown // optional explicit phase (editing); else server stamps the current week
}

// Resolve the stored (week_interval, anchor_day) pair from the request. A weekly
// block (interval 1) stores NULL anchor; an every-N-weeks block keeps a valid
// client-sent anchor (so editing doesn't re-phase the rota) or, lacking one, phases
// from the current local week.
const resolveRecurrence = (body: Body | null): { interval: number; anchor: number | null } => {
  const interval = weekInterval(body?.weekInterval)
  if (interval <= 1) return { interval: 1, anchor: null }
  const given = Number(body?.anchorDay)
  return { interval, anchor: Number.isFinite(given) && given > 0 ? Math.floor(given) : currentWeekStart() }
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, member_id, label, start_min, end_min, weekdays, holds_car, color, week_interval, anchor_day FROM schedule_blocks WHERE household_id = ? ORDER BY start_min',
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
  const { interval, anchor } = resolveRecurrence(body)
  await ctx.env.DB.prepare(
    'INSERT INTO schedule_blocks (id, household_id, member_id, label, start_min, end_min, weekdays, holds_car, color, week_interval, anchor_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      interval,
      anchor,
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
  const { interval, anchor } = resolveRecurrence(body)
  const res = await ctx.env.DB.prepare(
    'UPDATE schedule_blocks SET member_id = ?, label = ?, start_min = ?, end_min = ?, weekdays = ?, holds_car = ?, color = ?, week_interval = ?, anchor_day = ? WHERE id = ? AND household_id = ?',
  )
    .bind(
      memberId,
      body?.label?.trim().slice(0, 60) || null,
      startMin,
      endMin,
      JSON.stringify(cleanWeekdays(body?.weekdays)),
      body?.holdsCar === false ? 0 : 1,
      isHex(body?.color) ? body!.color!.toLowerCase() : null,
      interval,
      anchor,
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
