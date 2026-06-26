import type { CarSpan } from './carAvail'
import type { DerivedOccurrence } from './derived'
import { parseRecur, occurrenceOn, type Recur } from './recur'
import { localTimeOnDay, localDayStart, addLocalDays } from './ids'

// Bridge from « L'auto »'s stored schedule (the weekly schedule_blocks template +
// per-date car_day overrides) to the concrete CarSpan[] the carAvail engine works
// on. Pure (no DB, no clock): the caller passes the local-midnight `dayStart`.
// Minute-of-day → instant goes through localTimeOnDay so a work block keeps its WALL
// time across a DST change instead of drifting an hour twice a year.
//
// Recurrence rides the ONE engine `_lib/recur` (DB-4): a block stores a weekly
// `recur` rule (freq/interval/weekdays) + an `anchorAt` (the fortnight-phase ref),
// exactly like a recurring event — so "every other Saturday" reuses the same
// week-bucket math events use, with no parallel `weekActive` here.

export interface ScheduleBlock {
  id: string
  memberId: string
  label?: string | null
  startMin: number // minutes from local midnight
  endMin: number
  holdsCar: boolean
  color?: string | null
  recur: Recur // weekly recurrence (freq:'weekly', interval, weekdays 0=Sun…6=Sat) — the _lib/recur engine
  anchorAt: number // local-midnight fortnight-phase ref (0 = every-week; phase irrelevant at interval 1)
}

// One raw schedule_blocks row (post-DB-4: recurrence as `recur_json` + `anchor_day`),
// shared by every reader (car/board/month/this-week) so the row→ScheduleBlock parse
// lives in ONE place instead of four hand-rolled copies.
export interface ScheduleBlockRow {
  id: string
  member_id: string
  label: string | null
  start_min: number
  end_min: number
  holds_car: number
  color: string | null
  recur_json: string | null
  anchor_day: number | null
}

// Parse a stored row into a ScheduleBlock. A missing/corrupt rule falls back to an
// empty weekly rule (no weekdays → the block never fires, the safe default), so a bad
// row can never crash the resolver. anchor_day NULL → anchorAt 0 (every-week phase).
export function parseScheduleBlockRow(r: ScheduleBlockRow): ScheduleBlock {
  const recur = parseRecur(r.recur_json) ?? { freq: 'weekly', weekdays: [] }
  return {
    id: r.id,
    memberId: r.member_id,
    label: r.label,
    startMin: r.start_min,
    endMin: r.end_min,
    holdsCar: r.holds_car === 1,
    color: r.color,
    recur,
    anchorAt: r.anchor_day ?? 0,
  }
}

// Is a block active on the LOCAL day starting at `day`? Drives off `_lib/recur`'s
// `occurrenceOn` (weekday + fortnight phase, DST-safe) — but a schedule block with no
// weekday never fires (recur would otherwise fall back to the anchor's weekday), so
// guard that invariant first.
function blockActiveOn(b: ScheduleBlock, day: number): boolean {
  if (!b.recur.weekdays?.length) return false
  return occurrenceOn(day, b.anchorAt, b.recur) !== null
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
// template applies — every holds_car block active (weekday + fortnight) on this day.
export function carBusySpansForDay(
  dayStart: number,
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
    .filter((b) => b.holdsCar && b.endMin > b.startMin && blockActiveOn(b, dayStart))
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
export function membersOutAt(dayStart: number, blocks: ScheduleBlock[], t: number): string[] {
  const out = new Set<string>()
  for (const b of blocks) {
    if (b.endMin <= b.startMin || !blockActiveOn(b, dayStart)) continue
    if (t >= at(dayStart, b.startMin) && t < at(dayStart, b.endMin)) out.add(b.memberId)
  }
  return [...out]
}

// A concrete work-window instance on a given local day — what surfaces the schedule
// across the calendar/agenda (board, month, day page) the same way birthdays are
// DERIVED, never materialized as rows. `holdsCar` rides along so a renderer can tint
// the car-taking ones; the carAvail engine still owns conflicts/availability.
export interface WorkOccurrence extends DerivedOccurrence {
  id: string // `work:<blockId>:<dayStart>` — stable, never collides with an event id
  blockId: string
  memberId: string
  label: string | null
  at: number // unix seconds (the window's wall-clock start that local day) — DerivedOccurrence's instant
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
    for (const b of blocks) {
      if (b.endMin <= b.startMin || !blockActiveOn(b, day)) continue
      const startAt = at(day, b.startMin)
      const endAt = at(day, b.endMin)
      if (endAt <= rangeStart || startAt >= rangeEnd) continue
      out.push({
        id: `work:${b.id}:${day}`,
        blockId: b.id,
        memberId: b.memberId,
        label: b.label ?? null,
        at: startAt,
        endAt,
        holdsCar: b.holdsCar,
        color: b.color ?? null,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
