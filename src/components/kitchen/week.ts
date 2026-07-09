import { useMemo } from 'react'
import { addLocalDays } from '../../lib/localDay'
import { formatWeekday } from '../../lib/format'
import { type Lang } from '../../i18n'

// The kitchen countdown window, shared by everything that plans onto a day.
//
// Step by LOCAL calendar days, not a fixed 86 400 s: meals are bucketed at local
// midnight (functions/_lib/ids localDayStart) and a local day is 23 h/25 h across a
// DST change — plain arithmetic would land those days at 23:00/01:00 and a
// `days.find(d => d.date === date)` would miss them, showing meals a cell off twice
// a year. The Kitchen grid and the Idées scene both read the window from
// /api/meals (`weekStart` + `windowDays`), so this is the one place that builds it.

/** The window's local-midnight day stamps, in order. */
export function weekDates(weekStart: number, windowDays: number): number[] {
  return Array.from({ length: windowDays }, (_, i) => addLocalDays(weekStart, i))
}

/** The same window as the `{ date, label }` pairs MealPlanPicker's day chips take. */
export function useWeekLabeled(weekStart: number, windowDays: number, lang: Lang): { date: number; label: string }[] {
  return useMemo(
    () => weekDates(weekStart, windowDays).map((date) => ({ date, label: formatWeekday(date, lang) })),
    [weekStart, windowDays, lang],
  )
}
