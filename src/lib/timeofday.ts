// Time-of-day awareness for Aujourd'hui. A wall tablet should reflect the
// moment: morning leans on the day ahead, evening on supper + winding down.
// (DAKboard ships "different screens for different times of day" — same idea,
// kept calm: we re-order emphasis, we don't pop modals or nag.)
// Local hours on purpose: the board is a household-local glance surface.
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export function timeOfDay(ms: number): TimeOfDay {
  const h = new Date(ms).getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
