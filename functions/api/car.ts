import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays } from '../_lib/ids'
import { membersOutAt, type CarDayOverride } from '../_lib/carResolve'
import { carStatusAt, type CarSpan } from '../_lib/carAvail'
import { fetchCarOccupancy, resolveCarRange, overrideFor } from '../_lib/occupancy'

// « L'auto » read model — the resolved car picture, shared by the board glance card
// (today) and the /voiture week view (a date range). One read so both surfaces see
// the same resolved state: the car's busy spans (from the schedule_blocks template +
// car_day overrides), the day's rides (events that take the car or carry passengers,
// one-off AND recurring), and the conflicts between them. ZERO AI, pure D1 + the
// pure carResolve/carAvail libs.
//
//   GET /api/car                      -> today only (board card)
//   GET /api/car?from=<day>&to=<day>  -> [from, to) local-midnight days (/voiture week)


interface RideOut {
  id: string
  title: string
  at: number
  allDay: number
  carId: string | null
  passengers: string[]
  memberId: string | null
  contactId: string | null
  contactName: string | null
  businessId: string | null
  businessName: string | null
  conflict: boolean
}

interface DayOut {
  day: number
  spans: CarSpan[] // RAW schedule/override windows — what the /voiture day editor prefills from
  carSpans: CarSpan[] // RESOLVED busy: spans + the day's car-taking rendez-vous. Read THIS to ask "is the car busy?"
  rides: RideOut[]
  override: CarDayOverride | null // the per-date override in effect (so the editor can prefill + badge "Ajusté")
}

const parsePassengers = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}


export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const url = new URL(ctx.request.url)
  const today = localDayStart(new Date(Date.now()))
  // A MISSING param must fall back to today's window — NOT parse as 0. `Number(null)`
  // (an absent searchParam) is 0, which `Number.isFinite` accepts, so the old
  // `Number(get(...))` silently yielded from=to=0 → an empty day loop → no `todayDay`
  // → status fell back to "Libre toute la journée" on the board glance (which calls
  // /api/car with no params) even while the car was at work. Treat null/empty as absent.
  const numParam = (key: string, fallback: number): number => {
    const raw = url.searchParams.get(key)
    const n = raw == null || raw === '' ? NaN : Number(raw)
    return Number.isFinite(n) ? n : fallback
  }
  const from = numParam('from', today)
  const to = numParam('to', addLocalDays(today, 1))
  // ONE resolver, shared with every other surface that needs the same answer
  // (_lib/occupancy): the schedule template, the per-date adjustments and the
  // rendez-vous that take the car, resolved together. This endpoint used to own that
  // logic privately, which is why « À régler » could not see a car clash /api/car had
  // already computed.
  const occ = await fetchCarOccupancy(ctx.env, hh, from, to)
  const resolved = resolveCarRange(occ, from, to)

  const days: DayOut[] = resolved.map((d) => ({
    day: d.day,
    spans: d.spans,
    carSpans: d.carSpans,
    rides: d.rides
      .map(({ row, at, conflict }) => ({
        id: row.id,
        title: row.title,
        at,
        allDay: row.all_day,
        carId: row.car_id,
        passengers: parsePassengers(row.passengers),
        memberId: row.member_id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        businessId: row.business_id,
        businessName: row.business_name,
        conflict,
      }))
      .sort((a, b) => a.allDay - b.allDay || a.at - b.at),
    override: d.override,
  }))

  // "Now" block — only meaningful for today; the board card reads it. status = is
  // the car free right now / until when; membersOut = who's away (who's-home derive).
  const now = Math.floor(Date.now() / 1000)
  const todayInRange = today >= from && today < to
  const todayDay = days.find((d) => d.day === today)
  const dayEnd = addLocalDays(today, 1)
  // The live "right now" status reads the SAME resolved busy set every other surface
  // reads (`carSpans` — schedule/override windows plus the car-taking rendez-vous), so
  // the glance answers "où est l'auto" truthfully: a rendez-vous in progress reads
  // "Avec Camille · revient ~17 h", an upcoming one "Libre jusqu'à 14 h", a past one
  // "le reste de la journée" — never "Libre toute la journée" while the car is out.
  // This used to be folded here and ONLY here, which is why every other date lied.
  const status = todayDay ? carStatusAt(todayDay.carSpans, now, dayEnd) : { free: true as const }
  const membersOut = todayInRange ? membersOutAt(today, occ.blocks, now, overrideFor(occ, today)) : []

  return ok({
    cars: occ.cars,
    // Which car the resolved spans/conflicts are about. The client seeds a localized
    // default car when the household never configured one (lib/carPrefs), so it must
    // be told the id the server actually resolved against rather than inferring it.
    primaryCarId: occ.primaryCarId,
    hasSchedule: occ.hasSchedule,
    now,
    today,
    status,
    membersOut,
    days,
  })
})
