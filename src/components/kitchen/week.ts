import { useMemo } from 'react'
import { addLocalDays } from '../../lib/localDay'
import { formatWeekday } from '../../lib/format'
import { type Lang } from '../../i18n'

// The kitchen planning window, shared by everything that plans onto a day: today
// through today + the household's « Jours affichés » (7–14, default 10). It used to
// be a Tuesday-anchored block that decayed 10 → 4 across the week — see
// functions/api/meals.ts for why that had to go.
//
// Step by LOCAL calendar days, not a fixed 86 400 s: meals are bucketed at local
// midnight (functions/_lib/ids localDayStart) and a local day is 23 h/25 h across a
// DST change — plain arithmetic would land those days at 23:00/01:00 and a
// `days.find(d => d.date === date)` would miss them, showing meals a cell off twice
// a year. Every surface reads the window from /api/meals (`weekStart` +
// `windowDays`) and builds it HERE — the Kitchen grid, the Idées scene, the recipe
// view's day picker and the ＋ sheet's « Planifier un repas ». (The last two used to
// re-derive it inline, which is how this claim came to be untrue; fixed 2026-08-27.)

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
