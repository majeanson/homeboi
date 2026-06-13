// Pure month-grid math for the board's month view. Everything is UTC-day based
// to line up exactly with the server's `day` bucket keys (functions/api/month +
// _lib/ids dayStart, both UTC-midnight). A Québec household's wall month and its
// UTC month only diverge for the small hours after midnight — acceptable for a
// calm at-a-glance calendar, and it keeps the day keys identical on both ends.
const DAY = 86400

export interface MonthGrid {
  year: number
  month: number // 0-11, the focused calendar month
  monthStart: number // unix day-start of the 1st
  gridStart: number // unix day-start of the top-left cell (the Sunday on/before the 1st)
  days: number[] // 42 unix day-starts, six weeks Sun→Sat
}

// The six-week (42-cell) grid containing the given month, starting on Sunday.
// `month` may be < 0 or > 11 when navigating across a year boundary — Date.UTC
// normalizes it, and we read the real year/month back off the result.
export function monthGrid(year: number, month: number): MonthGrid {
  const monthStart = Math.floor(Date.UTC(year, month, 1) / 1000)
  const d = new Date(monthStart * 1000)
  const weekday = d.getUTCDay() // 0 = Sunday
  const gridStart = monthStart - weekday * DAY
  const days: number[] = []
  for (let i = 0; i < 42; i++) days.push(gridStart + i * DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), monthStart, gridStart, days }
}

// Is this unix day-start inside the focused month (vs a leading/trailing spill
// day from an adjacent month)?
export function inMonth(day: number, month: number): boolean {
  return new Date(day * 1000).getUTCMonth() === month
}
