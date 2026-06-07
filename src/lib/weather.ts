// Display side of the weather chip. The board endpoint sends a coarse bucket +
// temperature; here we pick a calm emoji for it (labels live in i18n under
// `weather`, keyed by the same bucket). Mirror of functions/_lib/weather's
// WeatherBucket — the two trees don't share code, so the union is restated.
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

const EMOJI: Record<WeatherBucket, string> = {
  clear: '☀️',
  cloud: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  rain: '🌧️',
  snow: '❄️',
  storm: '⛈️',
}

// Clear swaps to a moon at night; everything else reads the same day or night.
export const weatherEmoji = (w: Weather): string => (w.bucket === 'clear' && !w.isDay ? '🌙' : EMOJI[w.bucket])
