// Pure month-grid math for the board's month view. Everything is LOCAL-day based
// (household timezone, via lib/localDay) to line up exactly with the server's `day`
// bucket keys, which are now local-midnight too (functions/api/month +
// _lib/ids localDayStart). Local keys mean an evening event/meal lands on the cell
// the household is actually living, and "today" highlights the real local day — not
// the UTC day, which flips ~8 PM Eastern and shifted both a cell late all evening.
import { addLocalDays, localDayStart, localDayOfWeek, localYMD } from './localDay'

export interface MonthGrid {
  year: number
  month: number // 0-11, the focused calendar month
  monthStart: number // unix local-midnight of the 1st
  gridStart: number // unix local-midnight of the top-left cell (the Sunday on/before the 1st)
  days: number[] // 42 local-midnight day-starts, six weeks Sun→Sat
}

// The six-week (42-cell) grid containing the given month, starting on Sunday.
// `month` may be < 0 or > 11 when navigating across a year boundary — Date.UTC
// normalizes it, and we read the real local year/month back off the snapped 1st.
export function monthGrid(year: number, month: number): MonthGrid {
  // Noon UTC of the (normalized) 1st sits safely inside that calendar day in any
  // North-American zone; snap it to the day's LOCAL midnight for the bucket key.
  const monthStart = localDayStart(new Date(Date.UTC(year, month, 1, 12)))
  const { year: y, month: mo } = localYMD(monthStart)
  const weekday = localDayOfWeek(new Date(monthStart * 1000)) // 0 = Sunday, local
  const gridStart = addLocalDays(monthStart, -weekday)
  const days: number[] = []
  for (let i = 0; i < 42; i++) days.push(addLocalDays(gridStart, i))
  return { year: y, month: mo, monthStart, gridStart, days }
}

// Is this local day-start inside the focused month (vs a leading/trailing spill
// day from an adjacent month)?
export function inMonth(day: number, month: number): boolean {
  return localYMD(day).month === month
}
