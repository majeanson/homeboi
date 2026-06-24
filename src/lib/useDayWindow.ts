import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { MONTH_KEY } from './queryKeys'

// The `/api/month?from&to` window payload (mirrors functions/api/month.ts), and the
// ONE place the read + per-day bucketing lives — so every "a day / a range of days"
// surface (Moments, Mois, « Avant de partir », « La journée ») shares one fetch shape
// and one day-filter instead of each re-rolling it. Polled like the board glance.
export interface MonthEvent {
  id: string
  title: string
  at: number
  all_day: number
  member_id: string | null
  contact_id?: string | null
  contact_name?: string | null
  business_id?: string | null
  business_name?: string | null
  business_colour?: string | null
  birthday?: boolean
  age?: number | null
  work?: boolean // a derived « L'auto » work-schedule window
  end?: number // work windows carry an end instant (a span)
  color?: string | null
  holds_car?: number
  bring_template_id?: string | null // « Activité » — its "what to bring" list
  day: number // local-midnight unix sec of the occurrence
}
export interface MonthMeal {
  id: string
  slot: string
  title: string
  cook_member_id: string | null
  day: number
  is_leftover?: number
}
export interface MonthChore {
  id: string
  title: string
  color: string | null
  who: string | null // a resolved NAME here (not an id)
  day: number
}
export interface MonthHome {
  id: string
  kind: string
  title: string
  color: string | null
  day: number
}
export interface MonthTodo {
  id: string
  title: string
  member_id: string | null
  day: number
  section: string | null
}
export interface MonthNote {
  id: string
  text: string
  member_id: string | null
  day: number
}
export interface MonthData {
  events: MonthEvent[]
  meals: MonthMeal[]
  chores: MonthChore[]
  homeProjects?: MonthHome[]
  todos?: MonthTodo[]
  dayNotes?: MonthNote[]
}

// One day's slice of the window — the items that fall on `day`.
export interface DayItems {
  events: MonthEvent[]
  meals: MonthMeal[]
  chores: MonthChore[]
  home: MonthHome[]
  todos: MonthTodo[]
  note: MonthNote | null
}

// Fetch the [from, to) window once (shared MONTH_KEY cache, so a return from the day
// page that invalidates ['month'] refetches), and hand back a `dayItems(day)` selector
// that buckets the flat arrays. The window read + the filtering both live here.
export function useDayWindow(from: number, to: number) {
  const q = useQuery({
    queryKey: [...MONTH_KEY, from, to],
    queryFn: () => api<MonthData>(`month?from=${from}&to=${to}`),
    ...live,
  })
  const data = q.data
  const dayItems = (day: number): DayItems => ({
    events: (data?.events ?? []).filter((e) => e.day === day),
    meals: (data?.meals ?? []).filter((m) => m.day === day),
    chores: (data?.chores ?? []).filter((c) => c.day === day),
    home: (data?.homeProjects ?? []).filter((h) => h.day === day),
    todos: (data?.todos ?? []).filter((td) => td.day === day),
    note: (data?.dayNotes ?? []).find((n) => n.day === day) ?? null,
  })
  return { ...q, data, dayItems }
}
