// Tonight's moon phase, computed locally — NASA has no clean moon feed, and the
// phase is a smooth function of time, so a tiny pure calculation beats a network
// call (works offline, no key, no cache). Used by the « Ce soir dans le ciel »
// line (board/SkyTonight, inside « Dehors aujourd'hui »). Pure: the caller passes the timestamp, so
// it's deterministic and unit-testable.

// The eight named phases, in order from new moon. These keys match the i18n maps
// `board.sky.tonight.phase.*` and `board.sky.tonight.heard.*` (src/i18n.ts).
export type MoonPhaseKey =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent'

export interface MoonPhase {
  /** 0 = new, 0.5 = full, →1 wraps back to new. */
  fraction: number
  /** Illuminated fraction of the disc, 0 (new) … 1 (full). */
  illumination: number
  name: MoonPhaseKey
  emoji: string
}

// Mean length of a synodic month (new moon → new moon), in milliseconds.
const SYNODIC_MS = 29.530588853 * 24 * 60 * 60 * 1000
// A reference new moon: 2000-01-06 18:14 UTC.
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

// Phase-fraction → (key, emoji). Eight equal-ish bins centred on the four primary
// phases; new straddles the 0/1 wrap. Ordered low→high boundary.
const BINS: { max: number; name: MoonPhaseKey; emoji: string }[] = [
  { max: 0.0625, name: 'new', emoji: '🌑' },
  { max: 0.1875, name: 'waxingCrescent', emoji: '🌒' },
  { max: 0.3125, name: 'firstQuarter', emoji: '🌓' },
  { max: 0.4375, name: 'waxingGibbous', emoji: '🌔' },
  { max: 0.5625, name: 'full', emoji: '🌕' },
  { max: 0.6875, name: 'waningGibbous', emoji: '🌖' },
  { max: 0.8125, name: 'lastQuarter', emoji: '🌗' },
  { max: 0.9375, name: 'waningCrescent', emoji: '🌘' },
  // ≥ 0.9375 wraps back to new.
]

export function moonPhase(ms: number): MoonPhase {
  // Days since the reference new moon, wrapped into one synodic cycle → [0, 1).
  let fraction = ((ms - NEW_MOON_EPOCH_MS) % SYNODIC_MS) / SYNODIC_MS
  if (fraction < 0) fraction += 1
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2
  const bin = BINS.find((b) => fraction < b.max) ?? { name: 'new' as const, emoji: '🌑' }
  return { fraction, illumination, name: bin.name, emoji: bin.emoji }
}
