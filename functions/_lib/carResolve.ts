import type { CarSpan } from './carAvail'
import { localTimeOnDay } from './ids'

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
    .filter((b) => b.holdsCar && b.weekdays.includes(weekday) && b.endMin > b.startMin)
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
    if (t >= at(dayStart, b.startMin) && t < at(dayStart, b.endMin)) out.add(b.memberId)
  }
  return [...out]
}
