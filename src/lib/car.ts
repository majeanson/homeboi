import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { CAR_KEY } from './queryKeys'
import type { Car } from './carPrefs'

// Client view of the « L'auto » read model (/api/car). The board glance card reads
// today; the /voiture week reads a date range. Shapes mirror functions/api/car.ts.

export interface CarSpan {
  start: number
  end: number
  label?: string
  holderId?: string | null
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

export interface CarDay {
  day: number
  spans: CarSpan[]
  rides: CarRide[]
}

export interface CarStatus {
  free: boolean
  until?: number
  span?: CarSpan
}

export interface CarModel {
  cars: Car[]
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
