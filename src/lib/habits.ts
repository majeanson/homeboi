import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FR } from '../i18n'
import { api } from './api'
import { live } from './query'
import { HABITS_KEY, MONTH_KEY, BOARD_KEY } from './queryKeys'
import { useWrite } from './write'
import { useProfile } from './profile'
import { addLocalDays, localDayOfWeek, localMinuteOfDay, todayLocalDay } from './localDay'

// « Mes habitudes » — the wire shape from /api/habits + the pure selectors behind
// the daily check-in scene. See functions/api/habits.ts + migration 0112.
//
// A habit is one row; `days` is its append-only per-day history (one row per LOCAL
// day someone touched it). Nothing here is a score: what we DERIVE is "is it due
// today", "how far along today", and "how many days this week/month" — never a
// chain, a total across habits, or a comparison between members.

// 'defi' is « Le défi du jour » — one standing household habit that carries the
// day's family challenge. It never flows through the check-in/board/calendar habit
// lists (every selector below filters it out); it renders only as the board's
// pinned défi, with per-face marks (habit_marks, migration 0115).
export type HabitKind = 'do' | 'count' | 'limit' | 'avoid' | 'defi'
// Four rhythms, two families:
//   • BY DAY   — 'recur' (a schedule of dates) | 'week' (n times per local week)
//   • BY MOMENT (intra-day) — 'day' (n times a day) | 'hours' (every N hours in a window)
// The intra-day pair comes due EVERY day: what they ask for is a COUNT inside the
// day, not a set of dates. Both read that count off one field, `day_times`.
export type HabitCadence = 'recur' | 'week' | 'day' | 'hours'

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
  day_times: number | null // cadence='day'|'hours': n moments per local day ('hours' → computed server-side)
  every_hours: number | null // cadence='hours': hours between moments
  window_start: number | null // cadence='hours': first moment, minutes past local midnight
  window_end: number | null // cadence='hours': last moment allowed, same unit
  reminders: number[] // minutes past local midnight
  position: number
  archived: boolean
  due_days: number[] // server-expanded scheduled days (local midnights); empty for every cadence but 'recur'
}

// Defaults for the two intra-day cadences, shared by the form and the fallbacks
// below so a half-filled row never reads as "zero moments a day".
export const DEFAULT_DAY_TIMES = 3
export const DEFAULT_EVERY_HOURS = 4
export const DEFAULT_WINDOW_START = 8 * 60 // 08:00
export const DEFAULT_WINDOW_END = 20 * 60 // 20:00
export const MAX_DAY_TIMES = 24

export interface HabitDay {
  habit_id: string
  day: number // local midnight
  value: number // do/avoid-held: 0|1; count/limit: the day's absolute total
  slips: number // avoid only
  member_id: string | null
  note: string
}

// « Le défi du jour » — one face that tried today's shared défi (migration 0115).
// A FACE, never a count: the card lights up whoever tapped, and that's the whole
// record. `member_id` is who tried it (always set — a mark is never anonymous).
export interface HabitMark {
  habit_id: string
  day: number // local midnight
  member_id: string | null
}

export interface HabitsPayload {
  habits: Habit[]
  days: HabitDay[]
  marks?: HabitMark[] // optional: pre-0115 payloads / mocks may omit it
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

// The ONE check-in write, shared by every marking surface (the scene, the
// history backfill dots, the calendar day panel): an ABSOLUTE per-day value,
// upserted on (habit, day). The optimistic patch mirrors the server's upsert so
// the tap lands instantly and a replayed offline write converges on the same row
// rather than double-counting. MONTH_KEY rides along too — a mark taken from the
// scene or the history dots must still refresh the marking device's own month
// grid, which previously only reconciled on its own next poll.
export function useMarkHabit() {
  const write = useWrite()
  const { memberId: face } = useProfile()
  return useCallback(
    (habit: Habit, day: number, next: { value: number; slips?: number }) => {
      const body = { id: habit.id, mark: { day, value: next.value, slips: next.slips ?? 0 } }
      void write('habits', {
        method: 'PATCH',
        body,
        affectedKeys: [HABITS_KEY, MONTH_KEY],
        optimistic: (qc) =>
          qc.setQueryData<HabitsPayload>(HABITS_KEY, (cur) => {
            if (!cur) return cur
            const rest = cur.days.filter((d) => !(d.habit_id === habit.id && d.day === day))
            return {
              ...cur,
              days: [
                ...rest,
                { habit_id: habit.id, day, value: next.value, slips: next.slips ?? 0, member_id: face, note: '' },
              ],
            }
          }),
      })
    },
    [write, face],
  )
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

// --- Intra-day rhythm ---------------------------------------------------------

// The wall-clock moments an 'hours' habit asks for: from window_start, every
// every_hours, while still inside the window. Minutes past local midnight — the
// same unit as `reminders`, so the reminder engine reads one shape.
// Mirrors the server's slot COUNT (functions/api/habits.ts), which is what it
// stores into day_times; only the times themselves are re-derived here. Takes the
// four fields it reads, so the form can preview a DRAFT rhythm before it's a Habit.
export function hourSlots(habit: Pick<Habit, 'cadence' | 'every_hours' | 'window_start' | 'window_end'>): number[] {
  if (habit.cadence !== 'hours') return []
  const step = Math.max(1, habit.every_hours ?? DEFAULT_EVERY_HOURS) * 60
  const start = habit.window_start ?? DEFAULT_WINDOW_START
  // An end before the start would fit zero moments; pin it, so a half-dragged
  // window still asks once (the server pins it the same way).
  const end = Math.max(start, habit.window_end ?? DEFAULT_WINDOW_END)
  const out: number[] = []
  for (let m = start; m <= end && out.length < MAX_DAY_TIMES; m += step) out.push(m)
  return out
}

// How many marks THIS DAY is asking for — the one number both intra-day cadences
// resolve to. Every other cadence asks once (a scheduled day is done or it isn't).
export function dayGoal(habit: Habit): number {
  if (habit.cadence !== 'day' && habit.cadence !== 'hours') return 1
  return Math.max(1, Math.min(MAX_DAY_TIMES, habit.day_times ?? DEFAULT_DAY_TIMES))
}

// The times a habit can nudge at: an 'hours' habit's moments ARE its reminders
// (the rhythm generated them), so it never carries a hand-typed list.
export function reminderTimes(habit: Habit): number[] {
  return habit.cadence === 'hours' ? hourSlots(habit) : habit.reminders
}

// --- "Is this day's intention met?" ------------------------------------------
// Per kind, from that day's row alone. An ABSENT row is never a failure — it's a
// day nobody marked (neutral). `limit` counts as met while at/under the ceiling,
// including an untouched day (you smoked none), which is the gentle reading.
export function isDayDone(habit: Habit, row: HabitDay | undefined): boolean {
  const value = row?.value ?? 0
  switch (habit.kind) {
    // An intra-day rhythm turns « fait » into « fait n fois » — the value tallies
    // the moments, so one tap no longer settles a « 3 fois par jour » habit.
    case 'do':
      return value >= dayGoal(habit)
    case 'count':
      return value >= (habit.target ?? 1)
    case 'limit':
      return value <= (habit.target ?? 0)
    case 'avoid':
      return value > 0 && (row?.slips ?? 0) === 0
    // A défi is never "done" at the household-day level — its completion lives in
    // per-face marks (habit_marks), not this row. Excluded from every done-list.
    case 'defi':
      return false
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
//   • cadence 'recur'        → the server expanded its scheduled days into due_days.
//   • cadence 'week'         → any day, until the week's quota is met.
//   • cadence 'day'/'hours'  → every day (the rhythm lives INSIDE the day; whether
//     today is finished is isDaySettled's question, not this one).
// An archived habit never comes due.
export function isDueOn(habit: Habit, days: HabitDay[], day: number): boolean {
  if (habit.archived) return false
  if (habit.cadence === 'week') return remainingThisWeek(habit, days, day) > 0
  if (habit.cadence === 'day' || habit.cadence === 'hours') return true
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
  /** How many marks the day asks for: >1 only on an intra-day cadence. */
  goal: number
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
    goal: dayGoal(habit),
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
      // An intra-day rhythm says where the day stands in moments (« 2 sur 4 fois »);
      // a week quota says what the week still owes; a plain daily habit says nothing.
      if (status.goal > 1) return fn.ofTarget(status.value, status.goal, fn.timesUnit)
      return habit.cadence === 'week' && status.remainingWeek > 0 ? fn.remainingWeek(status.remainingWeek) : ''
    // A défi carries its own text on its board card; it has no per-row reading here.
    case 'defi':
      return ''
  }
}

// The face filter, mirroring visibleMots: a picked face sees THEIR habits plus the
// maisonnée-wide ones; "Maisonnée" (face null) sees only the household ones — a
// member's habits are never shown to whoever happens to be standing there.
export function visibleHabits(habits: Habit[], face: string | null): Habit[] {
  const base = face
    ? habits.filter((h) => h.member_id === null || h.member_id === face)
    : habits.filter((h) => h.member_id === null)
  // 'defi' is never an ordinary habit row — it renders only as the board's pinned
  // défi (see defiHabit), so every list built on visibleHabits skips it.
  return base.filter((h) => !h.archived && h.kind !== 'defi').sort((a, b) => a.position - b.position)
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

// Which of the habit's moments should fire right now: inside its grace window, not
// already fired today, and only while the habit is still un-done. Returns the
// reminder minute to record as fired, or null. An 'hours' habit's moments come
// from its rhythm (hourSlots) — there is nothing to type by hand.
export function reminderDue(
  habit: Habit,
  nowMinute: number,
  firedMinutes: number[],
  settled: boolean,
): number | null {
  if (settled || habit.archived) return null
  for (const m of reminderTimes(habit)) {
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

// --- « Le défi du jour » ------------------------------------------------------
// The whole feature rides `habits`: the défi is ONE standing household habit
// (kind='defi'), today's chosen text lives on its habit_days.note, and who tried
// it lives in `marks`. All count-free — a face is the record, never a tally.

// The household's standing défi habit, if it exists yet (created lazily on the
// first pige). There is at most one per household.
export function defiHabit(habits: Habit[]): Habit | undefined {
  return habits.find((h) => h.kind === 'defi')
}

// Today's committed défi text, or null if none drawn yet. The text is the day
// row's note; value≥1 means a défi was committed (vs an empty backfilled row).
export function todaysDefi(payload: HabitsPayload | undefined, day: number): { habit: Habit; text: string } | null {
  const habit = defiHabit(payload?.habits ?? [])
  if (!habit) return null
  const row = dayRow(payload?.days ?? [], habit.id, day)
  const text = row && row.value >= 1 ? row.note.trim() : ''
  return text ? { habit, text } : null
}

// The member ids who marked today's défi « tenu » — faces to light up, never a
// count. Deduped and order-stable.
export function defiMarkFaces(marks: HabitMark[] | undefined, habitId: string, day: number): string[] {
  const seen = new Set<string>()
  for (const m of marks ?? []) {
    if (m.habit_id === habitId && m.day === day && m.member_id) seen.add(m.member_id)
  }
  return [...seen]
}

// Whether the given face has already tried today's défi.
export function faceTriedDefi(marks: HabitMark[] | undefined, habitId: string, day: number, face: string | null): boolean {
  return !!face && defiMarkFaces(marks, habitId, day).includes(face)
}

// A normalized set of recently-drawn défi texts, so the pige can avoid repeating
// what the household has seen lately (the suggest-meal `avoid` idea, client-side).
export function recentDefiTexts(payload: HabitsPayload | undefined): Set<string> {
  const habit = defiHabit(payload?.habits ?? [])
  const out = new Set<string>()
  if (!habit) return out
  for (const d of payload?.days ?? []) {
    if (d.habit_id === habit.id && d.note.trim()) out.add(d.note.trim().toLowerCase())
  }
  return out
}

// Commit today's drawn/typed défi (accept a pige, or write your own / an AI one).
// The server find-or-creates the standing habit and upserts today's text; a first
// commit has no habit to patch optimistically, so the card fills on the refetch.
export function useCommitDefi() {
  const write = useWrite()
  return useCallback(
    (text: string, title?: string) => {
      const clean = text.trim()
      if (!clean) return
      void write('habits', {
        method: 'POST',
        body: { defi: { text: clean, title } },
        affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY],
      })
    },
    [write],
  )
}

// A per-face « Je l'ai tenu ! » toggle on today's défi. Optimistic like
// useMarkHabit: the tapped face lights up (or dims) at once, and a replayed
// offline write converges (insert-or-ignore / delete server-side).
export function useToggleDefiMark() {
  const write = useWrite()
  const { memberId: face } = useProfile()
  return useCallback(
    (habitId: string, day: number, on: boolean) => {
      if (!face) return // a mark is always someone's — the UI gates this too
      void write('habits', {
        method: 'PATCH',
        body: { id: habitId, defiMark: { day, on } },
        affectedKeys: [HABITS_KEY, BOARD_KEY],
        optimistic: (qc) =>
          qc.setQueryData<HabitsPayload>(HABITS_KEY, (cur) => {
            if (!cur) return cur
            const rest = (cur.marks ?? []).filter((m) => !(m.habit_id === habitId && m.day === day && m.member_id === face))
            return { ...cur, marks: on ? [...rest, { habit_id: habitId, day, member_id: face }] : rest }
          }),
      })
    },
    [write, face],
  )
}
