import { CATS } from '../../lib/cats'
import { formatTime } from '../../lib/format'
import { addLocalDays } from '../../lib/localDay'
import { isMealSlot, type MealSlot } from '../../lib/mealSlots'
import { type MealPrefs } from '../../lib/mealPrefs'
import { type Lang } from '../../i18n'
import { colorOf, type Dict, type Member } from './types'

// EVERY DATED THING ON A DAY, in one shape — lifted out of MonthView on 2026-09-15
// so « La semaine » could be the fourth face of it rather than a fourth opinion.
//
// MonthView's own header already said this was "the ONE builder behind all three
// faces of a day — the cell's dots, the cell's named lines, and the count under the
// panel header — so a thing can never show as a dot but go missing from the words".
// That promise only held inside one file. A week view rendering its own walk over the
// same payload would have been exactly the drift the sentence was written against:
// two lists of what Thursday holds, agreeing until the day somebody adds a kind to one.
//
// Nothing here renders. It buckets the /api/month payload by local day and turns one
// day into an ordered list of markers; MonthView draws them as a grid cell, WeekView
// as a row. Keep new dated kinds arriving HERE, once.

const DAY = 86400

// ── The /api/month payload, already bucketed onto a local `day` key by the server ──

export interface MEvent { id: string; title: string; at: number; all_day: number; member_id: string | null; passengers?: string | null; contact_name?: string | null; contact_address?: string | null; business_name?: string | null; business_id?: string | null; business_colour?: string | null; business_address?: string | null; end_at?: number | null; car_id?: string | null; day: number; birthday?: boolean; age?: number | null; work?: boolean; end?: number; color?: string | null; holds_car?: number }
export interface MMeal { id: string; slot: string; title: string; cook_member_id: string | null; day: number; position?: number }
export interface MChore { id: string; title: string; color: string | null; who: string | null; day: number }
export interface MNote { id: string; text: string; member_id: string | null; day: number }
export interface MTodo { id: string; title: string; member_id: string | null; day: number; section: string | null }
/** "Projets & Entretien" (home_projects) dated occurrence — chore-like on the calendar. */
export interface MHome { id: string; kind: string; title: string; color: string | null; day: number }
/** « Voyage » — a multi-day trip; drawn as a BAND across its days, not a per-day dot.
 *  `shared` = a « Voyage partagé » the household joined: same band, different tap. */
export interface MTrip { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: boolean }
export interface MTripPlan { id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; colour: string; day: number }
/** « Mes habitudes » — a DERIVED occurrence, never a stored row (the birthdays
 *  pattern). `done` = the intention was met, and it is the ONE thing the calendar
 *  reads; marking and editing live in « Le point du jour ». */
export interface MHabit { id: string; habit_id: string; title: string; icon: string; colour: string | null; kind: string; member_id: string | null; day: number; done: boolean }
/** « Les virements » — a plan's due date, DERIVED on /api/month. No amount rides
 *  along on purpose: the calendar is a kitchen wall surface. */
export interface MTransfer { id: string; planId: string; title: string; colour: string | null; day: number }
/** « Les calendriers » — one occurrence from a subscribed ICS feed (migration 0129).
 *  NOT an MEvent, deliberately: nothing can edit it, the next refresh replaces it
 *  wholesale, and giving it the household-event shape would hand it affordances it
 *  cannot honour. */
export interface MFeedEvent { id: string; title: string; location: string | null; at: number; end_at: number | null; all_day: number; day: number; feedId: string; feedLabel: string; colour: string | null; member_id: string | null }

export interface MonthData {
  events: MEvent[]
  meals: MMeal[]
  chores: MChore[]
  dayNotes: MNote[]
  todos: MTodo[]
  homeProjects?: MHome[]
  trips?: MTrip[]
  tripPlans?: MTripPlan[]
  habits?: MHabit[]
  transfers?: MTransfer[]
  feedEvents?: MFeedEvent[]
}

export interface DayBucket {
  events: MEvent[]
  meals: MMeal[]
  chores: MChore[]
  notes: MNote[]
  todos: MTodo[]
  home: MHome[]
  habits: MHabit[]
  transfers: MTransfer[]
  feed: MFeedEvent[]
}

/** One day's slice of a trip band: the trip + whether this cell is its first/last
 *  visible day (rounded ends + the title shows on the start). */
export interface TripSpan { id: string; title: string; colour: string; isStart: boolean; isEnd: boolean; start_at: number; shared?: boolean }

// A calendar marker: a colour AND a category, so a surface can tell each kind apart
// instead of drawing a wall of identical circles. Events/chores/notes are shape-coded
// dots (circle · diamond · ring); a MEAL shows its slot ICON tinted with the slot
// colour — far more glanceable, and it carries WHICH meal.
export type DotKind = 'event' | 'meal' | 'chore' | 'note' | 'todo' | 'birthday' | 'work' | 'habit' | 'transfer' | 'feed'
export interface Dot {
  color: string
  kind: DotKind
  slot?: MealSlot // meals → which slot icon to draw
  done?: boolean // habits: the day's intention was met (a filled ring, else hollow)
}
/** The same marker, plus what it SAYS once there is room for words. `time` is the
 *  clock face for a timed event and nothing for anything all-day. */
export interface Line extends Dot {
  time?: string
  label: string
}

/**
 * Bucket the whole payload by local day.
 *
 * `face` is the picked member (lib/profile) and gates HABITS only: the picked face
 * sees the household's habits plus their own, « Maisonnée » sees only the
 * household's — exactly as « Le point du jour » filters. A member's private habit
 * must never surface on a wall calendar for whoever happens to be standing there.
 */
export function bucketByDay(data: MonthData | undefined, face: string | null): Map<number, DayBucket> {
  const m = new Map<number, DayBucket>()
  const at = (d: number) => {
    let b = m.get(d)
    if (!b) {
      b = { events: [], meals: [], chores: [], notes: [], todos: [], home: [], habits: [], transfers: [], feed: [] }
      m.set(d, b)
    }
    return b
  }
  for (const e of data?.events ?? []) at(e.day).events.push(e)
  for (const x of data?.meals ?? []) at(x.day).meals.push(x)
  for (const c of data?.chores ?? []) at(c.day).chores.push(c)
  for (const td of data?.todos ?? []) at(td.day).todos.push(td)
  for (const h of data?.homeProjects ?? []) at(h.day).home.push(h)
  for (const h of data?.habits ?? []) if (h.member_id === null || h.member_id === face) at(h.day).habits.push(h)
  for (const tr of data?.transfers ?? []) at(tr.day).transfers.push(tr)
  for (const f of data?.feedEvents ?? []) at(f.day).feed.push(f)
  for (const n of data?.dayNotes ?? []) at(n.day).notes.push(n)
  return m
}

/**
 * Trip bands by day: each trip paints a strip across every day it covers, rounded on
 * its first/last. Clamped to [from, to) so a trip running past the window's edge
 * still bands the days that ARE shown. A day can carry several (overlapping trips).
 */
export function tripSpansByDay(trips: MTrip[] | undefined, from: number, to: number): Map<number, TripSpan[]> {
  const m = new Map<number, TripSpan[]>()
  for (const tr of trips ?? []) {
    const first = Math.max(tr.start_at, from)
    const last = Math.min(tr.end_at, to - DAY)
    for (let d = first; d <= last; d = addLocalDays(d, 1)) {
      const arr = m.get(d) ?? []
      arr.push({ id: tr.id, title: tr.title, colour: tr.colour, isStart: d === tr.start_at, isEnd: d === tr.end_at, start_at: tr.start_at, shared: tr.shared })
      m.set(d, arr)
    }
  }
  return m
}

/**
 * EVERY dated thing on a day, in the order every surface lists them: events first
 * (by member colour), then meals, chores, home projects, todos, habits, transfers,
 * notes.
 *
 * THE one walk. A compact density simply ignores `time`/`label` and draws the shape;
 * keep it that way rather than forking a second pass for a denser surface.
 */
export function linesFor(
  b: DayBucket | undefined,
  members: Member[],
  meals: MealPrefs,
  t: Dict,
  lang: Lang,
): Line[] {
  if (!b) return []
  const out: Line[] = []
  for (const e of b.events)
    out.push(
      e.birthday
        ? { color: CATS.birthday.color, kind: 'birthday', label: e.title }
        : e.work
          ? {
              color: e.color ?? colorOf(members, e.member_id) ?? CATS.work.color,
              kind: 'work',
              time: formatTime(e.at, lang),
              label: e.title || t.auto.work,
            }
          : {
              color: e.business_colour ?? colorOf(members, e.member_id) ?? CATS.event.color,
              kind: 'event',
              // All-day rows carry no clock — the label alone.
              time: e.all_day ? undefined : formatTime(e.at, lang),
              label: e.title,
            },
    )
  // Each shown meal gets its slot colour + icon (Réglages ▸ Repas); hidden slots = no marker.
  for (const m of b.meals)
    if (meals.isVisible(m.slot))
      out.push({
        color: meals.color(m.slot) ?? CATS.meal.color,
        kind: 'meal',
        slot: isMealSlot(m.slot) ? m.slot : undefined,
        label: m.title,
      })
  for (const c of b.chores) out.push({ color: c.color ?? CATS.chore.color, kind: 'chore', label: c.title })
  // Projets & Entretien read as chore-shaped dots; the row's own colour sets them apart.
  for (const h of b.home) out.push({ color: h.color ?? CATS.chore.color, kind: 'chore', label: h.title })
  // À compléter todos → a check icon tinted with the member colour, so they read
  // apart from the filled chore/event dots.
  for (const td of b.todos)
    out.push({ color: colorOf(members, td.member_id) ?? CATS.chore.color, kind: 'todo', label: td.title })
  // « Mes habitudes » — a ring, hollow until the day's intention was met. Its own
  // shape so a habit never reads as a chore you owe someone.
  for (const h of b.habits)
    out.push({ color: h.colour ?? CATS.routine.color, kind: 'habit', done: h.done, label: h.title })
  // A due date reads as its own marker — the plan's NAME and nothing else. What it
  // costs is one tap away, not on the wall.
  for (const tr of b.transfers) out.push({ color: tr.colour ?? CATS.cercle.color, kind: 'transfer', label: tr.title })
  // « Les calendriers » — a subscribed feed's occurrence. Its own kind and its own
  // glyph so it never reads as a household rendez-vous someone here arranged: it is
  // information arriving from outside, it cannot be edited, and the next refresh
  // replaces it. The feed's colour when it has one, so a household can tell the
  // school's calendar from the hockey team's at a glance.
  for (const f of b.feed)
    out.push({
      color: f.colour ?? CATS.event.color,
      kind: 'feed',
      time: f.all_day ? undefined : formatTime(f.at, lang),
      label: f.title,
    })
  for (const n of b.notes) out.push({ color: CATS.list.color, kind: 'note', label: n.text })
  return out
}
