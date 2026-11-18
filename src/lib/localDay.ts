// The client's face of the local-day math (shared/localDay.ts, the server's too). The
// app stores and buckets every dated thing (meals, day-notes, the meal week, the
// month grid) at LOCAL midnight in the household timezone, DST-aware — so the
// client must STEP and SNAP days the same way. Plain `+ i*86400` arithmetic drifts
// across a DST boundary (a local day is 23 h or 25 h), landing days a cell early or
// late twice a year.
//
// WHOSE zone? The HOUSEHOLD's, not the device's (migration 0135). A kiosk lives in the
// house, so the two agree there — but a phone carried into another zone must still read
// the household's own day, or « ce soir » would name a different supper than the wall
// tablet across the room. `setHouseholdTz()` is fed from /api/household (src/lib/
// householdTz.ts); until that answer lands, and on a deployment that predates 0135, it
// is America/Toronto — the pre-0135 behaviour.
import { addDaysIn, dayOfWeekIn, dayStartIn, wallClock } from '../../shared/localDay'

let HOUSEHOLD_TZ = 'America/Toronto'

/** Point every helper below at the household's zone. Idempotent; ignores nonsense. */
export function setHouseholdTz(tz: string | null | undefined): void {
  if (typeof tz === 'string' && tz && tz !== HOUSEHOLD_TZ) HOUSEHOLD_TZ = tz
}

// Unix-seconds of LOCAL midnight for the day containing `d` — the server's own function
// (shared/localDay), so client grid keys equal server day-bucket keys.
export const localDayStart = (d: Date, tz = HOUSEHOLD_TZ): number => dayStartIn(d, tz)

// Local midnight of the calendar day `n` days after the local-midnight `daySec`: walks the
// meal grid + month grid without DST drift.
export const addLocalDays = (daySec: number, n: number, tz = HOUSEHOLD_TZ): number => addDaysIn(daySec, n, tz)

// Minutes since local midnight (in `tz`) for an instant `d` — the TZ-safe building
// block for any "is it past N:MM household-local yet?" check (e.g. itemLife's meal-slot
// cutoffs). `d.getHours()/getMinutes()` reads the RUNTIME's zone, not the household's —
// correct on the kiosk (whose browser zone is the house) but wrong anywhere else (CI
// runners are UTC), so this kind of check must go through Intl/`tz`, not the raw Date
// accessors.
export function localMinuteOfDay(d: Date, tz = HOUSEHOLD_TZ): number {
  const w = wallClock(d, tz)
  return w.h * 60 + w.mi
}

// Day-of-week (0 = Sunday) of the local day containing `d`. The month grid's
// Sunday-start column must use the LOCAL weekday, not getUTCDay (which flips in
// the evening, when local-midnight is already the next UTC day).
export const localDayOfWeek = (d: Date, tz = HOUSEHOLD_TZ): number => dayOfWeekIn(d, tz)

// {year, month (0-11), day} of the local calendar day containing a local-midnight
// `daySec` — for month/day labels and the in-month spill check, TZ-correct
// regardless of the runtime's own zone.
export function localYMD(daySec: number, tz = HOUSEHOLD_TZ): { year: number; month: number; day: number } {
  const w = wallClock(new Date(daySec * 1000), tz)
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

// ── A <input type="date"> value ↔ a LOCAL day ────────────────────────────────
//
// `recurLabel`'s `dateToAnchorSec` / `anchorSecToDate` are the APPOINTMENT pair: they
// speak UTC midnight, because `functions/_lib/recur` anchors a series that way and an
// event carries its own time of day anyway.
//
// Anything whose unit is a DAY — a transfer's date, an agreement's first date, the day
// a gap was measured — must not use them. In America/Toronto a UTC midnight is 19:00 or
// 20:00 the PREVIOUS evening, so « 2026-02-12 » came back out as 11 février, and an
// agreement whose term ended on the 24th silently dropped the payment due that day
// (read off Marc's live rows, 2026-09-12). These two are the day-shaped pair.
export function localDayFromInput(value: string): number | null {
  const [y, m, d] = (value || '').split('-').map(Number)
  if (!y || !m || !d) return null
  // Noon UTC of the wall date, snapped back to that day's local midnight — the same
  // trick addLocalDays uses, and DST-safe for the same reason.
  return localDayStart(new Date(Date.UTC(y, m - 1, d, 12)))
}

export function inputFromLocalDay(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  const { year, month, day } = localYMD(sec)
  const pad = (n: number) => String(n).padStart(2, '0')
  // localYMD's `month` is 0-indexed (it mirrors Date's), so add one for the ISO shape.
  return `${year}-${pad(month + 1)}-${pad(day)}`
}
