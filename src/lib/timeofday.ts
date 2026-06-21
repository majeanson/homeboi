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
// drift across the day layered on top of the day/night theme. Calm by design —
// slow, warm, never flashing. Local hours, same as the greeting.
//
// The two `*twilight` parts are the SMOOTHING rungs Marc asked for (2026-06-20):
// instead of cutting cream→black in one step at nightfall (and back at wake-up),
// the theme axis steps day → twilight → deep-twilight → night, holding each dim
// "not-black-not-cream, dawny" tier ~45 min so the fall/rise is felt, not slammed.
// `themeForPart` (lib/theme.ts) maps each part to the matching `data-theme` tier;
// theme-bootstrap.js mirrors these exact windows so a kiosk reboots without a flash.
export type DayPart =
  | 'dawn'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'dusk'
  | 'twilight'
  | 'deep-twilight'
  | 'night'

export function computeDayPart(ms: number): DayPart {
  const m = new Date(ms)
  const mins = m.getHours() * 60 + m.getMinutes()
  // Morning rise: night → deep-twilight → twilight → dawn (light) → morning.
  if (mins >= 4 * 60 + 30 && mins < 5 * 60 + 15) return 'deep-twilight' // 04:30–05:15
  if (mins >= 5 * 60 + 15 && mins < 6 * 60) return 'twilight' // 05:15–06:00
  if (mins >= 6 * 60 && mins < 7 * 60) return 'dawn' // 06:00–07:00
  if (mins >= 7 * 60 && mins < 11 * 60) return 'morning' // 07:00–11:00
  if (mins >= 11 * 60 && mins < 14 * 60) return 'noon' // 11:00–14:00 (brightest)
  if (mins >= 14 * 60 && mins < 17 * 60) return 'afternoon' // 14:00–17:00
  // Evening fall: dusk (light golden) → twilight → deep-twilight → night.
  if (mins >= 17 * 60 && mins < 18 * 60 + 45) return 'dusk' // 17:00–18:45
  if (mins >= 18 * 60 + 45 && mins < 19 * 60 + 30) return 'twilight' // 18:45–19:30
  if (mins >= 19 * 60 + 30 && mins < 20 * 60 + 15) return 'deep-twilight' // 19:30–20:15
  return 'night' // 20:15–04:30
}
