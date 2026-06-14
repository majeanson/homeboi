// Display side of the weather chip. The board endpoint sends a coarse bucket +
// temperature; here we pick a calm Phosphor icon for it (labels live in i18n
// under `weather`, keyed by the same bucket). Mirror of functions/_lib/weather's
// WeatherBucket — the two trees don't share code, so the union is restated.
import type { IconName } from '../components/Icon'

export type WeatherBucket = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export interface Weather {
  tempC: number
  bucket: WeatherBucket
  isDay: boolean
}

// Tomorrow's coarse outlook for the "Demain" section (high/low, one bucket).
export interface DayOutlook {
  bucket: WeatherBucket
  highC: number
  lowC: number
}

// A single, calm dressing tip from today's conditions — never a list, never an
// alarm. Returns a key into i18n `weather.tip`, or null when nothing's worth
// saying (the common case; the line then hides). Order = most actionable first.
export type WeatherTip = 'umbrella' | 'snow' | 'storm' | 'bundle' | 'coat' | 'hydrate'

export function weatherTip(w: Weather | null): WeatherTip | null {
  if (!w) return null
  if (w.bucket === 'storm') return 'storm'
  if (w.bucket === 'rain' || w.bucket === 'drizzle') return 'umbrella'
  if (w.bucket === 'snow') return 'snow'
  if (w.tempC <= -10) return 'bundle'
  if (w.tempC <= 2) return 'coat'
  if (w.tempC >= 28) return 'hydrate'
  return null
}

const ICON: Record<WeatherBucket, IconName> = {
  clear: 'sun-bold',
  cloud: 'cloud-bold',
  fog: 'cloud-fog-bold',
  drizzle: 'cloud-rain-bold',
  rain: 'cloud-rain-bold',
  snow: 'cloud-snow-bold',
  storm: 'cloud-lightning-bold',
}

// Clear swaps to a moon at night; everything else reads the same day or night.
export const weatherIcon = (w: Weather): IconName => (w.bucket === 'clear' && !w.isDay ? 'moon-stars-bold' : ICON[w.bucket])

// A calm colour cue per condition (theme-aware CSS vars), so the monochrome
// Phosphor glyph keeps the at-a-glance read the old colour emoji gave on the
// wall: sun=marigold, rain/drizzle=sky, snow=pale sky, storm=alert clay, moon
// (clear night)=berry, cloud/fog=muted ink.
const TINT: Record<WeatherBucket, string> = {
  clear: 'var(--marigold-deep)',
  cloud: 'var(--ink-soft)',
  fog: 'var(--ink-faint)',
  drizzle: 'var(--sky-deep)',
  rain: 'var(--sky-deep)',
  snow: 'var(--sky)',
  storm: 'var(--terracotta-deep)',
}
export const weatherTint = (w: Weather): string =>
  w.bucket === 'clear' && !w.isDay ? 'var(--berry-deep)' : TINT[w.bucket]
