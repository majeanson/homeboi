// Recurrence for events ("garbage every Wednesday", "biweekly on Mon+Thu"). A
// small, testable RRULE subset — enough for a household, no external lib.
//
// The rule is stored as JSON on the event; the event's own start_at is the
// ANCHOR (first occurrence + the time-of-day every occurrence inherits). The
// board expands a recurring event into concrete occurrences for the day range it
// renders (today / tomorrow / the week), so storage stays one row per series.
//
// All day math is HOUSEHOLD-LOCAL-midnight based (America/Toronto, DST-aware via
// _lib/ids). It MUST be: on UTC the day flips at 20:00 Eastern, so "every 3 weeks
// on Thursday" anchored to a Thursday EVENING (= Friday in UTC) pinned every
// occurrence to UTC-Thursday-midnight = Wednesday evening local — the series
// surfaced one day early in À venir and on the month grid. Weekdays and week
// blocks are now read in local time so "Thursday" means the household's Thursday.
// Callers pass LOCAL-midnight day boundaries (board/month already do).

import { localDayStart, localDayOfWeek, addLocalDays } from './ids'

export interface Recur {
  freq: 'daily' | 'weekly' | 'monthly'
  interval?: number // every N days/weeks/months (default 1)
  weekdays?: number[] // weekly only: 0=Sun … 6=Sat
}

const DAY = 86400

// Parse a stored rule, returning null for "no recurrence" or anything malformed
// (a corrupt rule must never crash the board — it just reads as one-off).
export function parseRecur(json: string | null | undefined): Recur | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Recur
    if (v && (v.freq === 'daily' || v.freq === 'weekly' || v.freq === 'monthly')) return v
    return null
  } catch {
    return null
  }
}

// Normalize a Recur from untrusted input (the form), or null if it isn't a real
// rule. Clamps interval and validates weekdays so we never store garbage.
export function normalizeRecur(input: unknown): Recur | null {
  const v = input as Partial<Recur> | null | undefined
  if (!v || (v.freq !== 'daily' && v.freq !== 'weekly' && v.freq !== 'monthly')) return null
  const interval = Math.min(52, Math.max(1, Math.round(Number(v.interval) || 1)))
  const out: Recur = { freq: v.freq, interval }
  if (v.freq === 'weekly') {
    const wd = Array.isArray(v.weekdays)
      ? [...new Set(v.weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
      : []
    // Weekly with no weekday is meaningless — fall back to the anchor's weekday
    // is decided by the caller; here we just keep an empty list out.
    if (wd.length) out.weekdays = wd
  }
  return out
}

// Does the series (anchored at `anchorAt`, rule `r`) occur on the LOCAL day that
// starts at `day` (a household-local-midnight unix-s; see expandRange)? Returns
// the occurrence's unix-seconds timestamp (carrying the anchor's local time-of-day)
// or null. Occurrences never precede the anchor's day.
export function occurrenceOn(day: number, anchorAt: number, r: Recur): number | null {
  const anchorDay = localDayStart(new Date(anchorAt * 1000))
  if (day < anchorDay) return null
  const interval = Math.max(1, r.interval ?? 1)
  const timeOffset = anchorAt - anchorDay // seconds past LOCAL midnight to preserve

  let hit = false
  if (r.freq === 'daily') {
    hit = Math.round((day - anchorDay) / DAY) % interval === 0
  } else if (r.freq === 'weekly') {
    const weekday = localDayOfWeek(new Date(day * 1000))
    const days = r.weekdays?.length ? r.weekdays : [localDayOfWeek(new Date(anchorDay * 1000))]
    if (days.includes(weekday)) {
      // Count fortnights from the START of each LOCAL week, so every weekday in an
      // interval shares one bucket (biweekly Mon+Thu stay in the same fortnight).
      const weekStart = (sec: number) => sec - localDayOfWeek(new Date(sec * 1000)) * DAY
      // round, not floor: both day and anchorDay are local midnights, so their
      // difference is a whole number of days ± a DST hour — round absorbs that hour.
      const weeks = Math.round((weekStart(day) - weekStart(anchorDay)) / (7 * DAY))
      hit = weeks % interval === 0
    }
  } else if (r.freq === 'monthly') {
    // Both are local midnights (≈ 04:00–05:00 UTC, same calendar date), so getUTC*
    // reads the LOCAL year/month/day here. Anchor off anchorDay, NOT the raw instant
    // (whose UTC date can be the next day for an evening anchor).
    const a = new Date(anchorDay * 1000)
    const d = new Date(day * 1000)
    if (d.getUTCDate() === a.getUTCDate()) {
      const months = (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + (d.getUTCMonth() - a.getUTCMonth())
      hit = months >= 0 && months % interval === 0
    }
  }
  return hit ? day + timeOffset : null
}

// Expand a recurring series into the [rangeStart, rangeEnd) window (both unix
// seconds; rangeStart should be a day boundary). Returns occurrence timestamps,
// ascending. Bounded by the window, so the board's 7-day expansion is cheap.
export function expandRange(anchorAt: number, r: Recur, rangeStart: number, rangeEnd: number): number[] {
  const out: number[] = []
  // Step by LOCAL calendar days (DST-safe: a +86400 step would drift an hour twice
  // a year and skip/duplicate a day near the boundary).
  for (let day = localDayStart(new Date(rangeStart * 1000)); day < rangeEnd; day = addLocalDays(day, 1)) {
    const at = occurrenceOn(day, anchorAt, r)
    if (at !== null && at >= rangeStart && at < rangeEnd) out.push(at)
  }
  return out
}

// Project a shared-chore rotation forward. A chore's stored `current_idx` is the
// holder of the next PENDING occurrence — it advances by one only when someone
// marks the chore done, never by the date passing. So to label FUTURE occurrences
// in advance (the calendar showed them all as the current holder), we count how
// many scheduled occurrences sit between the pending one and the occurrence we're
// labelling: each future occurrence will advance the rotation by one.
//
// `refDay` is the day the pending occurrence falls on or after (today, or the day
// after a completion already consumed today's turn). Returns the rotation offset
// to add to `current_idx` — positive into the future, negative for past cells the
// calendar may also render (best-effort; per-occurrence history isn't stored).
// Counts day-by-day, bounded by the calendar window the caller renders.
export function rotationOffset(anchorAt: number, r: Recur, refDay: number, targetAt: number): number {
  const a = localDayStart(new Date(refDay * 1000))
  const b = localDayStart(new Date(targetAt * 1000))
  let n = 0
  if (b >= a) {
    // Occurrences in [refDay, target): the first occurrence on/after refDay is the
    // pending one (offset 0), each later one adds a turn.
    for (let day = a; day < b; day = addLocalDays(day, 1)) if (occurrenceOn(day, anchorAt, r) !== null) n++
  } else {
    // Past cell: occurrences in [target, refDay) walk the rotation backwards.
    for (let day = b; day < a; day = addLocalDays(day, 1)) if (occurrenceOn(day, anchorAt, r) !== null) n--
  }
  return n
}
