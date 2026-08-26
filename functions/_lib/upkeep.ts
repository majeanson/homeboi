// « Projets & Entretien » occurrence/status derivation — the ONE place that
// answers "when is this home_projects row due, and is it late?". Before this
// module, home-projects.ts / board.ts / month.ts / year.ts each re-implemented
// the expansion; they all consume these helpers now, so a semantic (like
// completion-relative recurrence) lands everywhere at once.
//
// Everything here is derived on read from the row's four scheduling fields —
// no materialized occurrence rows, no cron (the house rule; see _lib/recur.ts).
//
// recur_from (migration 0119) picks the cycle's origin:
//   'anchor' (default) — the fixed grid on `at`. October tires are October tires.
//   'done'             — « à partir de la dernière fois »: the grid re-anchors on
//                        last_done_at's local day. "Aux 3 mois" then means
//                        3 months after the last completion. Until a first
//                        completion exists, the anchor grid applies.
//
// Offline note: a complete replayed from the outbox stamps last_done_at at
// REPLAY time, so 'done' mode re-anchors late by the offline gap. Accepted —
// a calm, self-correcting drift (the next completion re-anchors again).

import { localDayStart, addLocalDays } from './ids'
import { parseRecur, expandRange, occurrenceOn, lastOccurrenceOnOrBefore } from './recur'

export interface UpkeepRowLike {
  at: number | null
  recur_json: string | null
  last_done_at: number | null
  recur_from?: string | null // 'anchor' (default) | 'done'
  // « Reporter » (0120): quiet until this local day, then the row returns on its
  // own. NULL/past = not postponed. Cleared by a complete.
  snoozed_until?: number | null
}

// How far back the overdue scan may look. Two years bounds the backwards walk
// for a sparse series (yearly, interval > 1) without ever missing a real miss —
// a household doesn't owe a chore older than that.
const LOOKBACK_DAYS = 730

const doneMode = (row: UpkeepRowLike): boolean => row.recur_from === 'done'

const lastDoneDay = (row: UpkeepRowLike): number | null =>
  row.last_done_at != null ? localDayStart(new Date(row.last_done_at * 1000)) : null

// The rule's effective anchor: last_done_at's local day when recur_from='done'
// and a completion exists, else the row's own `at`. Null when undated.
export function effectiveAnchor(row: UpkeepRowLike): number | null {
  if (row.at == null) return null
  if (doneMode(row)) {
    const d = lastDoneDay(row)
    if (d != null) return d
  }
  return row.at
}

export interface UpkeepOccOptions {
  // Calendars (month/year) pass true: a cell is a record of the day, so a
  // completed one-off keeps its cell and a 'done'-mode series paints its
  // last-done day. The board (a forward glance) leaves it false so a done
  // one-off drops and a 'done'-mode series only shows PENDING occurrences.
  includeDone?: boolean
}

// Every occurrence of the row in [from, to) (both local-midnight unix-s),
// ascending — the shared replacement for the per-endpoint expandRange calls.
// One-off rows yield their single date when in range.
export function upkeepOccurrences(row: UpkeepRowLike, from: number, to: number, opts?: UpkeepOccOptions): number[] {
  if (row.at == null) return []
  const r = parseRecur(row.recur_json)
  if (!r) {
    if (!opts?.includeDone && row.last_done_at != null) return []
    return row.at >= from && row.at < to ? [row.at] : []
  }
  const anchor = effectiveAnchor(row)
  if (anchor == null) return []
  let start = from
  if (!opts?.includeDone && doneMode(row)) {
    // The last-done day itself "hits" (it's the new anchor) but that occurrence
    // is the completion, not a pending one — start the window after it.
    const d = lastDoneDay(row)
    if (d != null) start = Math.max(start, addLocalDays(d, 1))
  }
  return expandRange(anchor, r, start, to)
}

export interface UpkeepStatus {
  // Next occurrence on/after today (a one-off reports its own date, even past —
  // that's what lets the season card group an overdue one-off). Null when the
  // row is undated or the next hit sits beyond the horizon. While postponed,
  // this is the day the row returns (snooze or the first occurrence past it).
  nextAt: number | null
  // An occurrence lands today and this cycle isn't checked off yet.
  dueToday: boolean
  // The most recent missed due date strictly before today, not covered by a
  // completion — the calm carry-forward: it stays until someone checks the row
  // (which stamps last_done_at >= it, clearing this with zero bookkeeping).
  overdueSince: number | null
  // « Reporter » in effect: the local day the row wakes back up (null when not
  // postponed or the snooze already passed). While set, dueToday/overdueSince
  // are suppressed — quiet, not gone.
  snoozedUntil: number | null
}

// « Reporter »: while today < snooze day, the row is quiet — no due, no owed —
// and nextAt reads as the day it comes back (the first scheduled occurrence on/
// after the snooze, else the snooze itself, so a snoozed past one-off never
// leaks onto the season card through a stale past nextAt).
function applySnooze(row: UpkeepRowLike, today: number, st: Omit<UpkeepStatus, 'snoozedUntil'>): UpkeepStatus {
  const day = row.snoozed_until != null ? localDayStart(new Date(row.snoozed_until * 1000)) : null
  if (day == null || today >= day) return { ...st, snoozedUntil: null }
  const nextAt = st.nextAt != null && st.nextAt >= day ? st.nextAt : day
  return { nextAt, dueToday: false, overdueSince: null, snoozedUntil: day }
}

// `today` must be a local-midnight unix-s (localDayStart of now) so every
// caller buckets on the same household-local day the board does.
export function upkeepStatus(row: UpkeepRowLike, today: number, horizonDays = 400): UpkeepStatus {
  if (row.at == null) return { nextAt: null, dueToday: false, overdueSince: null, snoozedUntil: null }
  const r = parseRecur(row.recur_json)
  if (!r) {
    const done = row.last_done_at != null
    const day = localDayStart(new Date(row.at * 1000))
    return applySnooze(row, today, {
      nextAt: row.at,
      dueToday: !done && day === today,
      overdueSince: !done && day < today ? row.at : null,
    })
  }
  const anchor = effectiveAnchor(row) as number
  const doneToday = row.last_done_at != null && row.last_done_at >= today
  const dueToday = occurrenceOn(today, anchor, r) !== null && !doneToday
  // nextAt = the next PENDING occurrence: once today's is checked off it stops
  // being "next" (otherwise the season card re-lists a row the moment it's done).
  const nextStart = doneToday ? addLocalDays(today, 1) : today
  const nextAt = upkeepOccurrences(row, nextStart, addLocalDays(nextStart, horizonDays))[0] ?? null
  // Most recent occurrence before today, floored at the last completion (a done
  // stamp covers every occurrence on/before its day) and the lookback bound.
  const done = lastDoneDay(row)
  let floor = addLocalDays(today, -LOOKBACK_DAYS)
  if (done != null) floor = Math.max(floor, done)
  const last = lastOccurrenceOnOrBefore(addLocalDays(today, -1), anchor, r, floor)
  const covered = last == null || (row.last_done_at != null && row.last_done_at >= last)
  return applySnooze(row, today, { nextAt, dueToday, overdueSince: covered ? null : last })
}

// The « Au prochain cycle » snooze target: the first scheduled occurrence
// STRICTLY AFTER today (skipping today's due and the owed one), as a local day.
// Null for a one-off / undated row — the client offers only the week option
// there, and the PATCH falls back to a week if it's ever asked anyway.
export function nextCycleDay(row: UpkeepRowLike, today: number, horizonDays = 400): number | null {
  if (row.at == null || parseRecur(row.recur_json) == null) return null
  const tomorrow = addLocalDays(today, 1)
  const next = upkeepOccurrences(row, tomorrow, addLocalDays(tomorrow, horizonDays))[0]
  return next != null ? localDayStart(new Date(next * 1000)) : null
}
