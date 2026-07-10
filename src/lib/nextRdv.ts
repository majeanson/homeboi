// « Prochain rendez-vous » — the soonest upcoming occurrence of an event linked to
// a « Le cercle » contact or business, for the read-only glance on their detail peek.
//
// Recurrence lives in the CLIENT tree here (browser-local time), deliberately NOT
// sharing functions/_lib/recur (the two trees don't share code — see recurLabel.ts).
// This mirrors that expander's freq/interval/weekday/monthly/yearly rules closely
// enough for a glance; the board/agenda remain the source of truth for what actually
// renders. A calm hint, not a scheduler — so a browser tz that differs from the
// household's only nudges the near-midnight edge, never the everyday case.
import { recurOf } from './recurLabel'
import type { RecurValue } from '../components/RecurPicker'

export interface RdvSource {
  title: string
  start_at: number
  all_day?: number
  recur_json?: string | null
}

export interface NextRdv {
  at: number // unix seconds of the next occurrence (carries the anchor's time-of-day)
  title: string
  allDay: boolean
}

const DAY_MS = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
// round, not floor: a DST boundary shifts two local midnights by ±1h; round absorbs it.
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS)

function occursOn(day: Date, anchorDay: Date, r: RecurValue, interval: number): boolean {
  if (day.getTime() < anchorDay.getTime()) return false
  switch (r.freq) {
    case 'daily':
      return diffDays(day, anchorDay) % interval === 0
    case 'weekly': {
      const days = r.weekdays?.length ? r.weekdays : [anchorDay.getDay()]
      if (!days.includes(day.getDay())) return false
      // Count fortnights from the START of each local week so every weekday in an
      // interval shares one bucket (biweekly Mon+Thu stay in the same fortnight).
      const weekStart = (d: Date) => startOfDay(new Date(d.getTime() - d.getDay() * DAY_MS))
      const weeks = Math.round((weekStart(day).getTime() - weekStart(anchorDay).getTime()) / (7 * DAY_MS))
      return weeks % interval === 0
    }
    case 'monthly': {
      if (day.getDate() !== anchorDay.getDate()) return false
      const months = (day.getFullYear() - anchorDay.getFullYear()) * 12 + (day.getMonth() - anchorDay.getMonth())
      return months >= 0 && months % interval === 0
    }
    case 'yearly': {
      // A Feb-29 anchor only hits in leap years — no rollover to Mar 1 (the calm choice).
      if (day.getMonth() !== anchorDay.getMonth() || day.getDate() !== anchorDay.getDate()) return false
      const years = day.getFullYear() - anchorDay.getFullYear()
      return years >= 0 && years % interval === 0
    }
  }
}

// The next occurrence (unix seconds) of one event at/after the start of today, or
// null. A one-off is itself iff still upcoming; a series is scanned forward ~2 years.
export function nextOccurrence(startAt: number, recurJson: string | null | undefined, nowMs = Date.now()): number | null {
  const anchor = new Date(startAt * 1000)
  const today = startOfDay(new Date(nowMs))
  const recur = recurOf(recurJson)
  if (!recur) return startAt * 1000 >= today.getTime() ? startAt : null
  const interval = Math.max(1, recur.interval ?? 1)
  const anchorDay = startOfDay(anchor)
  // Step by LOCAL calendar days (setDate) — a fixed +DAY_MS would drift across DST.
  const cur = new Date(Math.max(today.getTime(), anchorDay.getTime()))
  for (let i = 0; i < 800; i++, cur.setDate(cur.getDate() + 1)) {
    if (occursOn(startOfDay(cur), anchorDay, recur, interval)) {
      const occ = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), anchor.getHours(), anchor.getMinutes())
      if (occ.getTime() >= today.getTime()) return Math.floor(occ.getTime() / 1000)
    }
  }
  return null
}

// The soonest upcoming occurrence across every event matching `match` (e.g. linked
// to one contact/business) — one glance line for the peek, recurring or one-off.
export function nextRdvFor<E extends RdvSource>(events: E[], match: (e: E) => boolean, nowMs = Date.now()): NextRdv | null {
  let best: NextRdv | null = null
  for (const e of events) {
    if (!match(e)) continue
    const at = nextOccurrence(e.start_at, e.recur_json, nowMs)
    if (at == null) continue
    if (!best || at < best.at) best = { at, title: e.title, allDay: !!e.all_day }
  }
  return best
}
