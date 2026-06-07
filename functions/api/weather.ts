import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { householdPostal } from '../_lib/postal'
import { wmoBucket, type WeatherBucket } from '../_lib/weather'

// Current weather for the board, from the household's postal code. Two keyless,
// documented, free sources (no Flipp-style ToS risk):
//   1. Zippopotam — Canadian FSA (first 3 of the postal) -> lat/long.
//   2. Open-Meteo  — lat/long -> current temperature + WMO code + day/night.
// Edge-cached so a polling board doesn't hammer either. ALWAYS resolves 200 with
// `weather: null` on any miss (no postal, upstream down, bad payload) so the
// board just hides the chip — never an error on the render path (NFR-DEGRADE).

interface Weather {
  tempC: number
  bucket: WeatherBucket
  isDay: boolean
}
// Tomorrow's daily outlook for the board's "Demain" section: a coarse bucket and
// the day's high/low. No is_day (a whole day spans both).
interface DayOutlook {
  bucket: WeatherBucket
  highC: number
  lowC: number
}

export const onRequestGet = authed(async (ctx, actor) => {
  const postal = await householdPostal(ctx.env, actor.householdId)
  if (!postal) return ok({ weather: null, tomorrow: null })
  const wx = await fetchWeather(postal)
  return ok(wx ?? { weather: null, tomorrow: null })
})

async function fetchWeather(postal: string): Promise<{ weather: Weather | null; tomorrow: DayOutlook | null } | null> {
  try {
    const fsa = postal.slice(0, 3).toUpperCase()
    const geoRes = await fetch(`https://api.zippopotam.us/CA/${fsa}`, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 86400, cacheEverything: true }, // an FSA's location never moves
    })
    if (!geoRes.ok) return null
    const geo = (await geoRes.json()) as { places?: { latitude: string; longitude: string }[] }
    const place = geo.places?.[0]
    if (!place) return null

    // One call covers both: current conditions + a 2-day daily outlook (today +
    // tomorrow). timezone=auto so "tomorrow" is the household's local tomorrow.
    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,weather_code,is_day' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto',
      { cf: { cacheTtl: 900, cacheEverything: true } }, // 15 min is plenty for a wall board
    )
    if (!wxRes.ok) return null
    const wx = (await wxRes.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number }
      daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] }
    }
    const cur = wx.current
    const weather: Weather | null =
      cur && typeof cur.temperature_2m === 'number' && typeof cur.weather_code === 'number'
        ? { tempC: Math.round(cur.temperature_2m), bucket: wmoBucket(cur.weather_code), isDay: cur.is_day === 1 }
        : null

    // daily[1] is tomorrow (index 0 is today). Guard each field — a partial daily
    // payload shouldn't fail the whole call.
    const d = wx.daily
    const tomorrow: DayOutlook | null =
      d &&
      typeof d.weather_code?.[1] === 'number' &&
      typeof d.temperature_2m_max?.[1] === 'number' &&
      typeof d.temperature_2m_min?.[1] === 'number'
        ? {
            bucket: wmoBucket(d.weather_code[1]),
            highC: Math.round(d.temperature_2m_max[1]),
            lowC: Math.round(d.temperature_2m_min[1]),
          }
        : null

    return { weather, tomorrow }
  } catch {
    return null
  }
}
