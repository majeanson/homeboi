import type { CarSpan } from './carAvail'
import { localTimeOnDay, localDayOfWeek, localDayStart, addLocalDays } from './ids'

// Bridge from « L'auto »'s stored schedule (the weekly schedule_blocks template +
// per-date car_day overrides) to the concrete CarSpan[] the carAvail engine works
// on. Pure (no DB, no clock): the caller passes the local-midnight `dayStart` + the
// local `weekday` (both from ids.ts helpers). Minute-of-day → instant goes through
// localTimeOnDay so a work block keeps its WALL time across a DST change instead of
// drifting an hour twice a year.

export interface ScheduleBlock {
  id: string
  memberId: string
  label?: string | null
  startMin: number // minutes from local midnight
  endMin: number
  weekdays: number[] // 0=Sun … 6=Sat
  holdsCar: boolean
  color?: string | null
  weekInterval?: number // repeat every N weeks (1 = every week, the default). #28
  anchorDay?: number | null // local-midnight ref week the interval phases from (null = weekly)
}

const DAY = 86400

// Is `dayStart`'s LOCAL week an "on" week for an every-N-weeks block? interval ≤ 1
// (or a missing anchor) means "every week". Otherwise count whole weeks from the
// START of each local week (so every weekday in the same fortnight shares one
// bucket) and test the modulus — the SAME math _lib/recur uses for biweekly events,
// kept in sync deliberately. Both args are local midnights, so round() absorbs the
// ± DST hour their difference can carry.
function weekActive(dayStart: number, interval: number | undefined, anchorDay: number | null | undefined): boolean {
  const n = Math.max(1, Math.round(interval ?? 1))
  if (n === 1 || anchorDay == null) return true
  const weekStart = (sec: number) => sec - localDayOfWeek(new Date(sec * 1000)) * DAY
  const weeks = Math.round((weekStart(dayStart) - weekStart(anchorDay)) / (7 * DAY))
  return (((weeks % n) + n) % n) === 0
}

export interface CarDayOverride {
  carId: string
  day: number // local-midnight unix seconds of the overridden date
  free: boolean // true = the car stays home all day (clears the template)
  holderId?: string | null
  startMin?: number | null
  endMin?: number | null
  label?: string | null
}

// minutes-from-local-midnight → absolute unix seconds on that local day, wall-clock
// correct across DST (delegates to localTimeOnDay, the same snap _lib/recur uses).
const at = (dayStart: number, min: number): number => localTimeOnDay(dayStart, min * 60)

// The car's BUSY spans for ONE local day. An override for the car/day REPLACES the
// template (a single window, or nothing when the car stays home); otherwise the
// template applies — every holds_car block whose weekdays include this weekday.
export function carBusySpansForDay(
  dayStart: number,
  weekday: number,
  blocks: ScheduleBlock[],
  override?: CarDayOverride | null,
): CarSpan[] {
  if (override) {
    if (override.free) return []
    if (override.startMin != null && override.endMin != null && override.endMin > override.startMin) {
      return [
        {
          start: at(dayStart, override.startMin),
          end: at(dayStart, override.endMin),
          label: override.label ?? undefined,
          holderId: override.holderId ?? null,
        },
      ]
    }
    return []
  }
  return blocks
    .filter(
      (b) =>
        b.holdsCar && b.weekdays.includes(weekday) && b.endMin > b.startMin && weekActive(dayStart, b.weekInterval, b.anchorDay),
    )
    .map((b) => ({
      start: at(dayStart, b.startMin),
      end: at(dayStart, b.endMin),
      label: b.label ?? undefined,
      holderId: b.memberId,
    }))
}

// Presence — the member ids who are OUT at instant `t` (ANY block, car-holding or
// not, covering t). Powers the derived "who's home" glance (#30) for free off the
// same schedule. Deduped (a member with two overlapping blocks counts once).
export function membersOutAt(dayStart: number, weekday: number, blocks: ScheduleBlock[], t: number): string[] {
  const out = new Set<string>()
  for (const b of blocks) {
    if (!b.weekdays.includes(weekday) || b.endMin <= b.startMin) continue
    if (!weekActive(dayStart, b.weekInterval, b.anchorDay)) continue
    if (t >= at(dayStart, b.startMin) && t < at(dayStart, b.endMin)) out.add(b.memberId)
  }
  return [...out]
}

// A concrete work-window instance on a given local day — what surfaces the schedule
// across the calendar/agenda (board, month, day page) the same way birthdays are
// DERIVED, never materialized as rows. `holdsCar` rides along so a renderer can tint
// the car-taking ones; the carAvail engine still owns conflicts/availability.
export interface WorkOccurrence {
  id: string // `work:<blockId>:<dayStart>` — stable, never collides with an event id
  blockId: string
  memberId: string
  label: string | null
  startAt: number // unix seconds (the window's wall-clock start that local day)
  endAt: number
  holdsCar: boolean
  color: string | null
}

// Every schedule block's occurrence(s) inside [rangeStart, rangeEnd) (unix seconds;
// rangeStart a local-midnight day boundary). Walks LOCAL calendar days (DST-safe,
// like _lib/recur.expandRange) and emits a window per active weekday. Pure — the
// caller fetches the blocks; this never touches D1 or the clock.
export function workOccurrencesInRange(blocks: ScheduleBlock[], rangeStart: number, rangeEnd: number): WorkOccurrence[] {
  const out: WorkOccurrence[] = []
  for (let day = localDayStart(new Date(rangeStart * 1000)); day < rangeEnd; day = addLocalDays(day, 1)) {
    const weekday = localDayOfWeek(new Date(day * 1000))
    for (const b of blocks) {
      if (!b.weekdays.includes(weekday) || b.endMin <= b.startMin) continue
      if (!weekActive(day, b.weekInterval, b.anchorDay)) continue
      const startAt = at(day, b.startMin)
      const endAt = at(day, b.endMin)
      if (endAt <= rangeStart || startAt >= rangeEnd) continue
      out.push({
        id: `work:${b.id}:${day}`,
        blockId: b.id,
        memberId: b.memberId,
        label: b.label ?? null,
        startAt,
        endAt,
        holdsCar: b.holdsCar,
        color: b.color ?? null,
      })
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt)
}
