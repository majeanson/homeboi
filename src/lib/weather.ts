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
