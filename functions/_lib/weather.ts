// WMO weather-code bucketing. Open-Meteo reports a numeric WMO code (0–99); the
// board only needs a coarse, glanceable bucket (clear/cloud/rain/…) to pick an
// icon and a label. Kept pure + here so it's unit-tested and the display labels
// stay on the frontend (i18n).

export type WeatherBucket = 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export function wmoBucket(code: number): WeatherBucket {
  if (code <= 1) return 'clear' // 0 clear, 1 mainly clear
  if (code <= 3) return 'cloud' // 2 partly cloudy, 3 overcast
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm' // thunderstorm
  return 'cloud'
}
