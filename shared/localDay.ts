// THE local-day math, one copy for the Worker and the SPA (review #40). Every dated thing (meals,
// day-notes, the meal week, the month grid, a task's day) is stored and bucketed at LOCAL
// midnight in the household's zone, DST-aware — so the client's grid keys must equal the
// server's day buckets. This was two « behaviour-identical » copies (functions/_lib/ids.ts and
// src/lib/localDay.ts) until the client's lacked two of the server's caches; now both wrap this
// file and only supply their own DEFAULT zone (the request's on the server, functions/_lib/tz;
// the household's answer on the client, src/lib/householdTz).
//
// Every function takes the zone explicitly. Plain `+ i*86400` arithmetic drifts across a DST
// boundary (a local day is 23 h or 25 h), landing days a cell early or late twice a year.

// Constructing an Intl.DateTimeFormat costs ~100 µs (ICU locale + pattern resolution) —
// 1000× a formatToParts call. The calendar expanders walk these helpers day-by-day (400 days ×
// N recurring rows on /api/year), so fresh construction per call burned SECONDS of CPU and blew
// the Worker's per-request budget. One cached formatter per tz keeps every caller cheap.
const wallFmtCache = new Map<string, Intl.DateTimeFormat>()
function wallFmt(tz: string): Intl.DateTimeFormat {
  let f = wallFmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    wallFmtCache.set(tz, f)
  }
  return f
}

export interface WallClock {
  y: number
  mo: number // 1–12
  d: number
  h: number
  mi: number
  s: number
}

// Wall-clock Y/M/D h:m:s for an instant in `tz` (via Intl, DST-aware). Memoized per (tz,
// instant): the recurrence walkers hand the SAME midnights and noons back in across every row
// they expand, so repeat lookups are Map hits. Bounded — a calendar year touches ~1k instants;
// the cap only guards pathology.
const wallPartsCache = new Map<string, WallClock>()
export function wallClock(d: Date, tz: string): WallClock {
  const key = `${tz}:${d.getTime()}`
  const hit = wallPartsCache.get(key)
  if (hit) return hit
  const p = Object.fromEntries(wallFmt(tz).formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
  // Intl emits hour "24" at midnight in some runtimes — normalize to 0.
  const out = { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) }
  if (wallPartsCache.size > 20_000) wallPartsCache.clear()
  wallPartsCache.set(key, out)
  return out
}

// Unix-seconds of LOCAL midnight (in `tz`) for the day containing `d`. The double-offset pass
// keeps it correct across a DST boundary.
const dayStartCache = new Map<string, number>()
export function dayStartIn(d: Date, tz: string): number {
  const key = `${tz}:${d.getTime()}`
  const hit = dayStartCache.get(key)
  if (hit !== undefined) return hit
  const w = wallClock(d, tz)
  const offset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - d.getTime()
  const wallMidnight = Date.UTC(w.y, w.mo - 1, w.d)
  const approx = new Date(wallMidnight - offset)
  const w2 = wallClock(approx, tz)
  const offset2 = Date.UTC(w2.y, w2.mo - 1, w2.d, w2.h, w2.mi, w2.s) - approx.getTime()
  const out = Math.floor((wallMidnight - offset2) / 1000)
  if (dayStartCache.size > 20_000) dayStartCache.clear()
  dayStartCache.set(key, out)
  return out
}

// Local midnight (unix s) of the calendar day `n` days after the local-midnight `daySec`. Steps
// the day field (Date.UTC rolls month/year over) then snaps noon-of-that-day back to its local
// midnight — so a 23 h/25 h DST day doesn't drift the window an hour off.
export function addDaysIn(daySec: number, n: number, tz: string): number {
  const w = wallClock(new Date(daySec * 1000), tz)
  const noon = new Date(Date.UTC(w.y, w.mo - 1, w.d + n, 12))
  return dayStartIn(noon, tz)
}

// Unix-seconds of the WALL time `secsOfDay` seconds past local midnight on the local day that
// starts at `daySec`. DST-aware via the same double-offset snap: on a spring-forward day a 09:00
// wall time is a real 09:00 even though midnight+9h of elapsed seconds would land at 10:00. Used
// by _lib/recur so a recurring occurrence keeps the anchor's WALL time across a DST change. (The
// non-existent 02:00–03:00 spring-forward gap is ambiguous; the snap landing either side is fine.)
export function timeOnDayIn(daySec: number, secsOfDay: number, tz: string): number {
  const w = wallClock(new Date(daySec * 1000), tz)
  const wallTarget = Date.UTC(w.y, w.mo - 1, w.d) + secsOfDay * 1000 // desired wall clock as pseudo-UTC ms
  const dayOffset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - daySec * 1000
  const approx = new Date(wallTarget - dayOffset)
  const w2 = wallClock(approx, tz)
  const offset2 = Date.UTC(w2.y, w2.mo - 1, w2.d, w2.h, w2.mi, w2.s) - approx.getTime()
  return Math.floor((wallTarget - offset2) / 1000)
}

// Day-of-week (0 = Sunday) in `tz` — every week boundary must use the local day, not getUTCDay
// (which flips at 8 PM Eastern).
const weekdayFmtCache = new Map<string, Intl.DateTimeFormat>()
const weekdayCache = new Map<string, number>()
export function dayOfWeekIn(d: Date, tz: string): number {
  const key = `${tz}:${d.getTime()}`
  const hit = weekdayCache.get(key)
  if (hit !== undefined) return hit
  let f = weekdayFmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    weekdayFmtCache.set(tz, f)
  }
  const out = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f.format(d))
  if (weekdayCache.size > 20_000) weekdayCache.clear()
  weekdayCache.set(key, out)
  return out
}
