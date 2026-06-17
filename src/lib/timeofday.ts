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

// Finer-grained slice of the day for ambient theming (feature #1). Distinct from
// `timeOfDay` above (which only feeds the greeting): this drives a SUBTLE palette
// drift dawn→day→dusk→night layered on top of the binary day/night theme. Calm by
// design — slow, warm, never flashing. Local hours, same as the greeting.
export type DayPart = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night'

export function computeDayPart(ms: number): DayPart {
  const m = new Date(ms)
  const mins = m.getHours() * 60 + m.getMinutes()
  if (mins >= 5 * 60 && mins < 7 * 60) return 'dawn' // 05:00–07:00
  if (mins >= 7 * 60 && mins < 12 * 60) return 'morning' // 07:00–12:00
  if (mins >= 12 * 60 && mins < 17 * 60) return 'afternoon' // 12:00–17:00
  if (mins >= 17 * 60 && mins < 20 * 60 + 30) return 'dusk' // 17:00–20:30
  return 'night' // 20:30–05:00
}
