// Client-side mirror of the server's local-day math (functions/_lib/ids.ts). The
// app stores and buckets every dated thing (meals, day-notes, the meal week, the
// month grid) at LOCAL midnight in the household timezone, DST-aware — so the
// client must STEP and SNAP days the same way. Plain `+ i*86400` arithmetic drifts
// across a DST boundary (a local day is 23 h or 25 h), landing days a cell early or
// late twice a year. Rendering assumes the browser's zone is the household zone
// (the kiosk lives in the house), matching how the Kitchen grid already formats.
const HOUSEHOLD_TZ = 'America/Toronto'

// Constructing an Intl.DateTimeFormat costs ~100 µs — 1000× a formatToParts
// call — and the year/month grids walk these helpers hundreds of days at a time
// (the server twin burned whole SECONDS on /api/year before caching). One cached
// formatter per tz + memoized parts keep the walk at Map-hit cost; mirrors
// functions/_lib/ids.ts, which must stay behaviour-identical.
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

// Wall-clock Y/M/D h:m:s for an instant in `tz` (via Intl, DST-aware). Memoized
// per (tz, instant) — bounded; a year of day-walking touches ~1k instants.
const wallPartsCache = new Map<string, { y: number; mo: number; d: number; h: number; mi: number; s: number }>()
function wallParts(d: Date, tz: string) {
  const key = `${tz}:${d.getTime()}`
  const hit = wallPartsCache.get(key)
  if (hit) return hit
  const p = Object.fromEntries(wallFmt(tz).formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
  // Intl emits hour "24" at midnight in some runtimes — normalize to 0.
  const out = { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
  if (wallPartsCache.size > 20_000) wallPartsCache.clear()
  wallPartsCache.set(key, out)
  return out
}

// Unix-seconds of LOCAL midnight (in `tz`) for the day containing `d`. The
// double-offset pass keeps it correct across a DST boundary. Identical to the
// server's localDayStart so client grid keys equal server day-bucket keys.
export function localDayStart(d: Date, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(d, tz)
  const offset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - d.getTime()
  const wallMidnight = Date.UTC(w.y, w.mo - 1, w.d)
  const approx = new Date(wallMidnight - offset)
  const w2 = wallParts(approx, tz)
  const offset2 = Date.UTC(w2.y, w2.mo - 1, w2.d, w2.h, w2.mi, w2.s) - approx.getTime()
  return Math.floor((wallMidnight - offset2) / 1000)
}

// Local midnight (unix s) of the calendar day `n` days after the local-midnight
// `daySec`. Walks the meal grid + month grid without DST drift: we read the start
// day's wall date, add `n` to the calendar field (Date.UTC rolls month/year over),
// then snap noon-of-that-day back to its local midnight. Noon UTC sits safely
// inside the target calendar day in any North-American zone.
export function addLocalDays(daySec: number, n: number, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(new Date(daySec * 1000), tz)
  const noon = new Date(Date.UTC(w.y, w.mo - 1, w.d + n, 12))
  return localDayStart(noon, tz)
}

// Minutes since local midnight (in `tz`) for an instant `d` — the TZ-safe building
// block for any "is it past N:MM household-local yet?" check (e.g. itemLife's meal-slot
// cutoffs). `d.getHours()/getMinutes()` reads the RUNTIME's zone, not the household's —
// correct on the kiosk (whose browser zone is the house) but wrong anywhere else (CI
// runners are UTC), so this kind of check must go through Intl/`tz`, not the raw Date
// accessors.
export function localMinuteOfDay(d: Date, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(d, tz)
  return w.h * 60 + w.mi
}

// Day-of-week (0 = Sunday) of the local day containing `d`. The month grid's
// Sunday-start column must use the LOCAL weekday, not getUTCDay (which flips in
// the evening, when local-midnight is already the next UTC day).
const weekdayFmtCache = new Map<string, Intl.DateTimeFormat>()
export function localDayOfWeek(d: Date, tz = HOUSEHOLD_TZ): number {
  let f = weekdayFmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    weekdayFmtCache.set(tz, f)
  }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f.format(d))
}

// {year, month (0-11), day} of the local calendar day containing a local-midnight
// `daySec` — for month/day labels and the in-month spill check, TZ-correct
// regardless of the runtime's own zone.
export function localYMD(daySec: number, tz = HOUSEHOLD_TZ): { year: number; month: number; day: number } {
  const w = wallParts(new Date(daySec * 1000), tz)
  return { year: w.y, month: w.mo - 1, day: w.d }
}

// Unix-seconds of TODAY's local midnight — the meal-week / month-view anchor.
export const todayLocalDay = (tz = HOUSEHOLD_TZ): number => localDayStart(new Date(Date.now()), tz)

// Whole LOCAL calendar days from today to the day containing `unixSec` (0 = today,
// 1 = tomorrow, negative = past). Counts wall days, DST-correct — feeds the calm
// "dans X jours" hint on À venir items (pair with t.cercle.inDaysN). `now` is
// injectable so callers/tests stay pure.
export function daysUntilLocal(unixSec: number, now: number = Date.now(), tz = HOUSEHOLD_TZ): number {
  return Math.round((localDayStart(new Date(unixSec * 1000), tz) - localDayStart(new Date(now), tz)) / 86400)
}
