import { createDeviceStore } from './createDeviceStore'

// How much a « Mois » calendar CELL says before you tap it.
//
//   'compact'  — shape-coded dots (the calm default): a cell answers "something
//                happens here", and the day panel answers "what".
//   'detailed' — the first few things NAMED right in the cell (« 14 h Dentiste »,
//                « Souper · pâté chinois »), so a wall tablet read from across the
//                room answers "what's in the day" with no tap at all.
//
// One toggle flips the WHOLE grid rather than a breakpoint rule or a per-cell state:
// a phone cell is ~48 px wide, so text there is a deliberate choice the household
// makes, not something a media query imposes on them. Compact stays the default —
// the calendar is a glance surface first.
//
// DEVICE-LOCAL (localStorage, not household data), exactly like the aisle tags and the
// board card layout: the kiosk and the phone each keep their own, it writes nothing to
// /api/*, and a read-only guest may use it. Never gate this with `isGuest()`.
const density = createDeviceStore<MonthDensity>('babillard-month-density', 'compact', {
  read: (raw) => (raw === 'detailed' ? 'detailed' : 'compact'),
  write: (v) => v,
})

// Not exported: nothing outside needs to name it (the store is the API), and an
// unused exported type is a knip finding.
type MonthDensity = 'compact' | 'detailed'
export const useMonthDensity = density.use
export const setMonthDensity = density.set
