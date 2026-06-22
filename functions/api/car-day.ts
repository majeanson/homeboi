import { badRequest, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// Per-date car overrides for « L'auto » (migration 0070) — the "schedules vary week
// by week" layer the /voiture week view edits in one tap. The weekly schedule_blocks
// template is the default; a car_day row REPLACES it for one (car, date): a single
// out-window, or "stays home" (free).
//
//   GET    /api/car-day?from=<day>&to=<day>  -> { overrides } in [from, to) (local-midnight unix s)
//   POST   /api/car-day                      -> upsert one { carId, day, free?, holderId?, startMin?, endMin?, label? }
//   DELETE /api/car-day                      -> remove one { carId, day } (revert that day to the template)
//
// Open to any authed actor (a parent-mode kiosk plans the week); guests blocked by authed().

interface OverrideRow {
  id: string
  car_id: string
  day: number
  free: number
  holder_id: string | null
  start_min: number | null
  end_min: number | null
  label: string | null
}

const toClient = (r: OverrideRow) => ({
  carId: r.car_id,
  day: r.day,
  free: r.free === 1,
  holderId: r.holder_id,
  startMin: r.start_min,
  endMin: r.end_min,
  label: r.label,
})

const MAX_MIN = 24 * 60
const minute = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), MAX_MIN) : null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const from = Number(url.searchParams.get('from'))
  const to = Number(url.searchParams.get('to'))
  if (!Number.isFinite(from) || !Number.isFinite(to)) return badRequest('from + to requis.')
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, car_id, day, free, holder_id, start_min, end_min, label FROM car_day WHERE household_id = ? AND day >= ? AND day < ? ORDER BY day',
  )
    .bind(actor.householdId, from, to)
    .all<OverrideRow>()
  return ok({ overrides: results.map(toClient) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{
    carId?: string
    day?: number
    free?: boolean
    holderId?: string | null
    startMin?: unknown
    endMin?: unknown
    label?: string | null
  }>(ctx.request)
  const carId = body?.carId?.trim()
  const day = Number(body?.day)
  if (!carId || !Number.isFinite(day)) return badRequest('carId + day requis.')
  const free = body?.free ? 1 : 0
  // A non-free override needs a usable window; otherwise we still store it (it reads
  // as "car free that day" via the resolver) so the editor can express "no car
  // commitment today" distinctly from "use the template" (= delete the row).
  const startMin = free ? null : minute(body?.startMin)
  const endMin = free ? null : minute(body?.endMin)
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO car_day (id, household_id, car_id, day, free, holder_id, start_min, end_min, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(household_id, car_id, day) DO UPDATE SET
       free = excluded.free, holder_id = excluded.holder_id, start_min = excluded.start_min,
       end_min = excluded.end_min, label = excluded.label, updated_at = excluded.updated_at`,
  )
    .bind(
      newId(),
      actor.householdId,
      carId,
      Math.floor(day),
      free,
      body?.holderId?.trim() || null,
      startMin,
      endMin,
      body?.label?.trim().slice(0, 60) || null,
      ts,
      ts,
    )
    .run()
  return ok({ ok: true })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ carId?: string; day?: number }>(ctx.request)
  const carId = body?.carId?.trim()
  const day = Number(body?.day)
  if (!carId || !Number.isFinite(day)) return badRequest('carId + day requis.')
  await ctx.env.DB.prepare('DELETE FROM car_day WHERE household_id = ? AND car_id = ? AND day = ?')
    .bind(actor.householdId, carId, Math.floor(day))
    .run()
  return ok({ ok: true })
})
