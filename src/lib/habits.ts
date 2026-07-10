import { useQuery } from '@tanstack/react-query'
import type { FR } from '../i18n'
import { api } from './api'
import { live } from './query'
import { HABITS_KEY } from './queryKeys'
import { addLocalDays, localDayOfWeek, localMinuteOfDay, todayLocalDay } from './localDay'

// « Mes habitudes » — the wire shape from /api/habits + the pure selectors behind
// the daily check-in scene. See functions/api/habits.ts + migration 0112.
//
// A habit is one row; `days` is its append-only per-day history (one row per LOCAL
// day someone touched it). Nothing here is a score: what we DERIVE is "is it due
// today", "how far along today", and "how many days this week/month" — never a
// chain, a total across habits, or a comparison between members.

export type HabitKind = 'do' | 'count' | 'limit' | 'avoid'
export type HabitCadence = 'recur' | 'week'

export interface Habit {
  id: string
  member_id: string | null // OWNER: NULL = the whole maisonnée
  title: string
  icon: string
  colour: string | null
  kind: HabitKind
  target: number | null // count: the goal; limit: the soft ceiling
  unit: string
  cadence: HabitCadence
  recur: string | null // raw Recur JSON (cadence='recur'); NULL = every day
  week_times: number | null // cadence='week': n times per local week
  reminders: number[] // minutes past local midnight
  position: number
  archived: boolean
  due_days: number[] // server-expanded scheduled days (local midnights); empty for cadence='week'
}

export interface HabitDay {
  habit_id: string
  day: number // local midnight
  value: number // do/avoid-held: 0|1; count/limit: the day's absolute total
  slips: number // avoid only
  member_id: string | null
  note: string
}

export interface HabitsPayload {
  habits: Habit[]
  days: HabitDay[]
  today: number
}

// `live: false` shares the same cache off the poll cadence (the free-tier lever,
// like useCarnets): the default-on board card must not add /api/habits to the
// board's poll. Realtime nudges + the check-in scene's own live read keep it fresh.
export function useHabits(opts?: { live?: boolean }) {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: () => api<HabitsPayload>('habits'),
    ...(opts?.live === false ? { staleTime: 5 * 60_000 } : live),
  })
}

// --- Day lookup --------------------------------------------------------------

export function dayRow(days: HabitDay[], habitId: string, day: number): HabitDay | undefined {
  return days.find((d) => d.habit_id === habitId && d.day === day)
}

// The local week containing `day`, as [start, end) local midnights (Sunday-start,
// matching the month grid's column convention).
export function weekBounds(day: number): [number, number] {
  const start = addLocalDays(day, -localDayOfWeek(new Date(day * 1000)))
  return [start, addLocalDays(start, 7)]
}

// --- "Is this day's intention met?" ------------------------------------------
// Per kind, from that day's row alone. An ABSENT row is never a failure — it's a
// day nobody marked (neutral). `limit` counts as met while at/under the ceiling,
// including an untouched day (you smoked none), which is the gentle reading.
export function isDayDone(habit: Habit, row: HabitDay | undefined): boolean {
  const value = row?.value ?? 0
  switch (habit.kind) {
    case 'do':
      return value > 0
    case 'count':
      return value >= (habit.target ?? 1)
    case 'limit':
      return value <= (habit.target ?? 0)
    case 'avoid':
      return value > 0 && (row?.slips ?? 0) === 0
  }
}

// A day the user said something about. The server writes a row on ANY mark, so a
// `limit` habit tapped « aucune aujourd'hui » (value 0) still counts as engaged —
// which is what distinguishes "I had none" from "I never opened the app".
export function isDayMarked(row: HabitDay | undefined): boolean {
  return !!row
}

// Has today's habit been put to rest? Two shapes:
//   • GOAL-shaped ('do', 'count') settle when the intention is REACHED.
//   • CONFIRMATION-shaped ('limit', 'avoid') settle once you've TOUCHED them —
//     a ceiling of 5 smokes is never "achieved" by doing nothing, so it asks for
//     a word rather than a completion. Going over the ceiling still settles the
//     day (it's noted, not scolded); the row simply reads as not-done.
// This is what the check-in scene and the reminder trigger ask, not isDayDone.
export function isDaySettled(habit: Habit, row: HabitDay | undefined): boolean {
  return habit.kind === 'limit' || habit.kind === 'avoid' ? isDayMarked(row) : isDayDone(habit, row)
}

// --- Cadence -----------------------------------------------------------------

// How many more times this week a `week`-cadence habit is looking for. Counts
// distinct MARKED-and-DONE days in the local week containing `day`. Zero (or less)
// means the week's intention is already met — it drops out of the due list.
export function remainingThisWeek(habit: Habit, days: HabitDay[], day: number): number {
  if (habit.cadence !== 'week') return 0
  const [start, end] = weekBounds(day)
  const done = days.filter(
    (d) => d.habit_id === habit.id && d.day >= start && d.day < end && isDayMarked(d) && isDayDone(habit, d),
  ).length
  return Math.max(0, (habit.week_times ?? 1) - done)
}

// Is the habit asking for attention on `day`?
//   • cadence 'recur' → the server expanded its scheduled days into due_days.
//   • cadence 'week'  → any day, until the week's quota is met.
// An archived habit never comes due.
export function isDueOn(habit: Habit, days: HabitDay[], day: number): boolean {
  if (habit.archived) return false
  if (habit.cadence === 'week') return remainingThisWeek(habit, days, day) > 0
  return habit.due_days.includes(day)
}

// --- The scene's row model ---------------------------------------------------

export interface HabitStatus {
  due: boolean
  /** The intention was met (a `limit` at/under its ceiling counts as met). */
  done: boolean
  /** Someone said something about this day. */
  marked: boolean
  /** Nothing more is being asked today (see isDaySettled). */
  settled: boolean
  value: number
  slips: number
  /** cadence='week' only: how many more times the week is looking for. */
  remainingWeek: number
  /** count/limit only: the goal or ceiling. */
  target: number | null
}

export function habitStatusOn(habit: Habit, days: HabitDay[], day: number): HabitStatus {
  const row = dayRow(days, habit.id, day)
  return {
    due: isDueOn(habit, days, day),
    done: isDayDone(habit, row),
    marked: isDayMarked(row),
    settled: isDaySettled(habit, row),
    value: row?.value ?? 0,
    slips: row?.slips ?? 0,
    remainingWeek: remainingThisWeek(habit, days, day),
    target: habit.target,
  }
}

// The quiet line under a habit's title — "where today stands, in the habit's own
// words". ONE reading, shared by the check-in row (HabitRow) and the board's
// « Mes habitudes » glance, so the two surfaces never drift apart. Never a score:
// a `limit` gone over reads « C'est noté », a slip « ça arrive ».
type HabitStrings = typeof FR.habits

export function habitReading(habit: Habit, status: HabitStatus, fn: HabitStrings): string {
  const target = status.target ?? 0
  switch (habit.kind) {
    case 'count':
      return fn.ofTarget(status.value, target, habit.unit)
    case 'limit':
      return status.value > target ? fn.noted : fn.ofCeiling(status.value, target, habit.unit)
    case 'avoid':
      return status.slips > 0 ? fn.slipped : status.marked ? fn.held : fn.avoidHint
    case 'do':
      return habit.cadence === 'week' && status.remainingWeek > 0 ? fn.remainingWeek(status.remainingWeek) : ''
  }
}

// The face filter, mirroring visibleMots: a picked face sees THEIR habits plus the
// maisonnée-wide ones; "Maisonnée" (face null) sees only the household ones — a
// member's habits are never shown to whoever happens to be standing there.
export function visibleHabits(habits: Habit[], face: string | null): Habit[] {
  const base = face
    ? habits.filter((h) => h.member_id === null || h.member_id === face)
    : habits.filter((h) => h.member_id === null)
  return base.filter((h) => !h.archived).sort((a, b) => a.position - b.position)
}

// --- Derived history (the "fuller history" view) -----------------------------
// Per-habit, gentle: how many days in a window this habit's intention was met.
// Deliberately NOT a chain, NOT a percentage-as-grade, NOT cross-habit.
export interface HabitProgress {
  /** Done days in the local week containing `today`. */
  weekDone: number
  /** Done days in the last 30 local days (inclusive of today). */
  monthDone: number
  /** The 7 days of `today`'s local week, oldest first, with each day's state. */
  week: { day: number; done: boolean; marked: boolean; future: boolean }[]
}

export function deriveProgress(habit: Habit, days: HabitDay[], today: number): HabitProgress {
  const [start] = weekBounds(today)
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addLocalDays(start, i)
    const row = dayRow(days, habit.id, day)
    return { day, done: isDayMarked(row) && isDayDone(habit, row), marked: isDayMarked(row), future: day > today }
  })
  const monthStart = addLocalDays(today, -29)
  const monthDone = days.filter(
    (d) => d.habit_id === habit.id && d.day >= monthStart && d.day <= today && isDayMarked(d) && isDayDone(habit, d),
  ).length
  return { weekDone: week.filter((w) => w.done).length, monthDone, week }
}

// --- In-app reminders (no push, no cron: the open kiosk's own clock) ---------
// A reminder time is a wall-clock minute past LOCAL midnight, so it survives DST
// (on a spring-forward day, minutes 120–179 never occur — a 02:30 reminder simply
// doesn't fire that day; nobody schedules one there).
//
// GRACE keeps a reminder useful when the screen was busy at the exact minute,
// without resurrecting a 09:00 reminder at supper time.
export const REMINDER_GRACE_MIN = 30

// Which of `habit.reminders` should fire right now: inside its grace window, not
// already fired today, and only while the habit is still un-done. Returns the
// reminder minute to record as fired, or null.
export function reminderDue(
  habit: Habit,
  nowMinute: number,
  firedMinutes: number[],
  settled: boolean,
): number | null {
  if (settled || habit.archived) return null
  for (const m of habit.reminders) {
    if (firedMinutes.includes(m)) continue
    if (nowMinute >= m && nowMinute < m + REMINDER_GRACE_MIN) return m
  }
  return null
}

// The habits still asking for something today, for a given face — the set the
// check-in scene leads with and the shell-level trigger counts. A settled habit
// (done, or confirmed for a limit/avoid) drops out; it stays reachable under the
// scene's « Déjà réglé » fold.
export function dueToday(habits: Habit[], days: HabitDay[], face: string | null, today: number): Habit[] {
  return visibleHabits(habits, face).filter(
    (h) => isDueOn(h, days, today) && !isDaySettled(h, dayRow(days, h.id, today)),
  )
}

// `today` off the wall clock — kept here so the scene/trigger share one notion of
// the day with the server's local-midnight bucketing.
export const habitToday = () => todayLocalDay()

// The current wall-clock minute past local midnight (the reminder matcher's input).
export const nowMinute = (now: number = Date.now()) => localMinuteOfDay(new Date(now))
