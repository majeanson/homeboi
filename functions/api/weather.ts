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
// A calm few-hours-ahead glance for the weather hero: a handful of forward steps,
// each just an hour + temp + bucket (icon). Never a full hourly table — a glance.
interface HourOutlook {
  hour: number // local hour-of-day, 0–23
  tempC: number
  bucket: WeatherBucket
}

export const onRequestGet = authed(async (ctx, actor) => {
  const postal = await householdPostal(ctx.env, actor.householdId)
  if (!postal) return ok({ weather: null, tomorrow: null, hours: null })
  const wx = await fetchWeather(postal)
  return ok(wx ?? { weather: null, tomorrow: null, hours: null })
})

async function fetchWeather(
  postal: string,
): Promise<{ weather: Weather | null; tomorrow: DayOutlook | null; hours: HourOutlook[] | null } | null> {
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
        '&hourly=temperature_2m,weather_code' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto',
      { cf: { cacheTtl: 900, cacheEverything: true } }, // 15 min is plenty for a wall board
    )
    if (!wxRes.ok) return null
    const wx = (await wxRes.json()) as {
      current?: { time?: string; temperature_2m?: number; weather_code?: number; is_day?: number }
      hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[] }
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

    // A few steps ahead (+3/+6/+9 h) for the weather hero's calm forecast strip.
    // Anchor on `current.time` (local ISO "YYYY-MM-DDTHH:mm", timezone=auto) → find that
    // hour in the hourly arrays, then step forward. Each step guarded; the whole strip is
    // dropped (null) on any partial payload, so the hero just shows "now" alone.
    const hourly = wx.hourly
    let hours: HourOutlook[] | null = null
    if (cur?.time && hourly?.time && hourly.temperature_2m && hourly.weather_code) {
      const curPrefix = cur.time.slice(0, 13) // "YYYY-MM-DDTHH"
      let idx = hourly.time.findIndex((s) => s.slice(0, 13) === curPrefix)
      if (idx < 0) idx = 0
      const out: HourOutlook[] = []
      for (const step of [3, 6, 9]) {
        const j = idx + step
        const temp = hourly.temperature_2m[j]
        const code = hourly.weather_code[j]
        const iso = hourly.time[j]
        if (typeof temp === 'number' && typeof code === 'number' && iso) {
          out.push({ hour: Number(iso.slice(11, 13)), tempC: Math.round(temp), bucket: wmoBucket(code) })
        }
      }
      if (out.length) hours = out
    }

    return { weather, tomorrow, hours }
  } catch {
    return null
  }
}
