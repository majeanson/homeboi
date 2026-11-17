import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { CAR_KEY } from './queryKeys'
import type { Car } from './carPrefs'

// Client view of the « L'auto » read model (/api/car). The board glance card reads
// today; the /voiture week reads a date range. Shapes mirror functions/api/car.ts.

interface CarSpan {
  start: number
  end: number
  label?: string
  holderId?: string | null
}

// A busy span as words: « 8 h 00–17 h 00 », or `allDay` when it covers the whole local
// day [dayStart, dayEnd). An all-day rendez-vous that takes the car is exactly that span,
// and it printed « 0 h 00–0 h 00 » (review #12, 2026-11-17).
export function spanWindow(s: CarSpan, dayStart: number, dayEnd: number, hhmm: (at: number) => string, allDay: string): string {
  return s.start <= dayStart && s.end >= dayEnd ? allDay : `${hhmm(s.start)}–${hhmm(s.end)}`
}

export interface CarRide {
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

interface CarDayOverride {
  carId: string
  day: number
  free: boolean
  holderId?: string | null
  startMin?: number | null
  endMin?: number | null
  label?: string | null
}

export interface CarDay {
  day: number
  // RAW schedule/override windows — the /voiture day editor prefills its start/end
  // from these, and the « Ajusté » badge reads the override beside them.
  spans: CarSpan[]
  // RESOLVED busy: `spans` PLUS the rendez-vous that take the car that day. Anything
  // asking "is the car busy on this day?" reads THIS. Reading `spans` instead is what
  // made the board card (on any date but today) and every /voiture week row announce
  // « Libre toute la journée » directly above the outings that filled the day.
  carSpans: CarSpan[]
  rides: CarRide[]
  override: CarDayOverride | null
}

interface CarStatus {
  free: boolean
  until?: number
  span?: CarSpan
  // The day holds at least one commitment (busy span or car-taking ride) even if the
  // car is free right now → "libre — le reste de la journée" instead of "toute la
  // journée". Mirrors functions/_lib/carAvail CarStatus.
  committed?: boolean
}

export interface CarModel {
  cars: Car[]
  // The car the server resolved spans/conflicts against (v1 = the first one).
  primaryCarId: string
  hasSchedule: boolean
  now: number
  today: number
  status: CarStatus
  membersOut: string[]
  days: CarDay[]
}

// Today's resolved car picture — the board glance card. Polls like the board so a
// ride added on another device shows up.
export function useCarToday() {
  return useQuery({ queryKey: CAR_KEY, queryFn: () => api<CarModel>('car'), ...live })
}

// A date window [from, to) of resolved days — the /voiture week view. Keyed by
// `from` so paging weeks keeps each in cache; a prefix of CAR_KEY so a write
// invalidates every loaded week.
export function useCarWeek(from: number, to: number) {
  return useQuery({
    queryKey: [...CAR_KEY, from],
    queryFn: () => api<CarModel>(`car?from=${from}&to=${to}`),
    ...live,
  })
}
