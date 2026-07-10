import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useProfile } from '../../lib/profile'
import { useUndoToast } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { TODOS_KEY, MONTH_KEY, CAR_KEY } from '../../lib/queryKeys'
import { type CarModel } from '../../lib/car'
import { CATS } from '../../lib/cats'
import { formatTime, formatMonthYear, formatDayLong, weekdayShort, capitalize as cap } from '../../lib/format'
import { monthGrid, inMonth } from '../../lib/monthgrid'
import { localYMD, addLocalDays } from '../../lib/localDay'
import { SLOT_ICON_NAME, isMealSlot, slotLabel as slotLabelFor, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs, type MealPrefs } from '../../lib/mealPrefs'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { type Lang } from '../../i18n'
import '../../styles/habits.css'
import { useHabits, useMarkHabit, habitStatusOn, splitHabitsForDay } from '../../lib/habits'
import { Icon } from '../Icon'
import { Act } from './Act'
import { Disclosure } from '../Disclosure'
import { HabitRow } from '../habits/HabitRow'
import { tripCategoryIcon, type TripCategory } from '../voyage/voyage'
import { AutoCardView } from './AutoCard'
import { DayNote } from './DayNote'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, buildChore, type DetailCtx } from '../detail/adapters'
import { useOpenMeal } from '../detail/useOpenMeal'
import { useEventPeekActions } from '../detail/EventPeekActions'
import { colorOf, nameOf, type Dict, type Member } from './types'

const DAY = 86400

// The /api/month payload: every dated thing, already bucketed onto a UTC `day`
// key by the server. Mirrors the families on the bento board so the calendar is a
// faithful "is it all here?" inventory — events, meals, recurring chores, notes.
interface MEvent { id: string; title: string; at: number; all_day: number; member_id: string | null; contact_name?: string | null; business_name?: string | null; business_id?: string | null; business_colour?: string | null; day: number; birthday?: boolean; age?: number | null; work?: boolean; end?: number; color?: string | null; holds_car?: number }
interface MMeal { id: string; slot: string; title: string; cook_member_id: string | null; day: number; position?: number }
interface MChore { id: string; title: string; color: string | null; who: string | null; day: number }
interface MNote { id: string; text: string; member_id: string | null; day: number }
interface MTodo { id: string; title: string; member_id: string | null; day: number; section: string | null }
// "Projets & Entretien" (home_projects) dated occurrence — chore-like on the calendar.
interface MHome { id: string; kind: string; title: string; color: string | null; day: number }
// « Voyage » — a multi-day trip; drawn as a BAND across its days (not a per-day dot).
// `shared` = a « Voyage partagé » the household is a member of (promoted/joined): same
// band, but the tap deep-links to /voyage/partage/:id instead of /voyage/:id.
interface MTrip { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: boolean }
// A dated itinerary entry inside a trip — the plans the operator wrote for the day,
// shown under the trip card on that exact day (not just the global trip band).
interface MTripPlan { id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; colour: string; day: number }
// « Mes habitudes » — a DERIVED occurrence, never a stored row (the birthdays
// pattern), used for the grid DOTS only. A scheduled habit emits every due day; a
// week-quota one only the days it was actually done (no fictional scheduling).
// `done` = the intention was met. The tapped-day PANEL below reads the real habits
// (useHabits) instead, so today/any past day can be marked right there — a future
// day (or a guest) still just taps through to « Le point du jour ».
interface MHabit { id: string; habit_id: string; title: string; icon: string; colour: string | null; kind: string; member_id: string | null; day: number; done: boolean }
export interface MonthData { events: MEvent[]; meals: MMeal[]; chores: MChore[]; dayNotes: MNote[]; todos: MTodo[]; homeProjects?: MHome[]; trips?: MTrip[]; tripPlans?: MTripPlan[]; habits?: MHabit[] }

interface DayBucket { events: MEvent[]; meals: MMeal[]; chores: MChore[]; notes: MNote[]; todos: MTodo[]; home: MHome[]; habits: MHabit[] }
// One day's slice of a trip band: the trip + whether this cell is its first/last
// visible day (rounded ends + the title shows on the start).
interface TripSpan { id: string; title: string; colour: string; isStart: boolean; isEnd: boolean; start_at: number; shared?: boolean }

// Intl gives a lowercase French month/weekday ("juin", "lun") — calendars want it
// capitalized.

// A calendar marker: a colour AND a category, so the cell can tell each kind
// apart instead of a wall of identical circles. Events/chores/notes are shape-coded
// dots (circle · diamond · ring); a MEAL shows its slot ICON (egg/fork/cookie/bowl,
// reusing Réglages ▸ Repas) tinted with the slot colour — far more glanceable than
// a square and it carries which meal. Colour still carries who (events) / slot
// (meals) / chore tint.
type DotKind = 'event' | 'meal' | 'chore' | 'note' | 'todo' | 'birthday' | 'work' | 'habit'
interface Dot {
  color: string
  kind: DotKind
  slot?: MealSlot // set for meals → which slot icon to draw
  done?: boolean // habits: the day's intention was met (a filled ring, else hollow)
}

// The markers a cell shows: one per dated thing, ordered the same way the detail
// panel lists them (events first, by member colour, then meals, chores, notes).
function dotsFor(b: DayBucket | undefined, members: Member[], meals: MealPrefs): Dot[] {
  if (!b) return []
  const out: Dot[] = []
  for (const e of b.events)
    out.push(
      e.birthday
        ? { color: CATS.birthday.color, kind: 'birthday' }
        : e.work
          ? { color: e.color ?? colorOf(members, e.member_id) ?? CATS.work.color, kind: 'work' }
          : { color: e.business_colour ?? colorOf(members, e.member_id) ?? CATS.event.color, kind: 'event' },
    )
  // Each shown meal gets its slot colour + icon (Réglages ▸ Repas); hidden slots = no marker.
  for (const m of b.meals)
    if (meals.isVisible(m.slot))
      out.push({ color: meals.color(m.slot) ?? CATS.meal.color, kind: 'meal', slot: isMealSlot(m.slot) ? m.slot : undefined })
  for (const c of b.chores) out.push({ color: c.color ?? CATS.chore.color, kind: 'chore' })
  // Projets & Entretien read as chore-shaped dots; the row's own colour sets them apart.
  for (const h of b.home) out.push({ color: h.color ?? CATS.chore.color, kind: 'chore' })
  // À compléter todos → a check icon tinted with the member colour (drawn like the
  // meal slot icons), so they read apart from the filled chore/event dots.
  for (const td of b.todos) out.push({ color: colorOf(members, td.member_id) ?? CATS.chore.color, kind: 'todo' })
  // « Mes habitudes » — a ring, hollow until the day's intention was met. Its own
  // shape so a habit never reads as a chore you owe someone.
  for (const h of b.habits) out.push({ color: h.colour ?? CATS.routine.color, kind: 'habit', done: h.done })
  b.notes.forEach(() => out.push({ color: CATS.list.color, kind: 'note' }))
  return out
}

// "Mois" — the fourth board take (after bento · next · lanes): a calm six-week
// calendar of EVERYTHING dated, so a glance answers "what's the month look like?"
// Cells carry colour dots; tapping a day opens its full list below. Its own slow
// read (not the live board poll): browsing the month isn't the glance surface.
export function MonthView({
  members,
  lang,
  t,
  todayDay,
  initialOffset = 0,
}: {
  members: Member[]
  lang: Lang
  t: Dict
  todayDay: number
  // Land on a month other than the current one (the year view's month tap
  // drills in here). Read once at mount; the arrows own it after.
  initialOffset?: number
}) {
  const nav = useNavigate()
  // The picked face — the calendar applies the same private-ish habit filter the
  // check-in scene does (see the day buckets below).
  const { memberId: face } = useProfile()
  const write = useWrite()
  const undo = useUndoToast()
  const qc = useQueryClient()
  // Tap a meal/event/chore in the day panel to peek its detail — the same sheet the
  // bento board uses. The /api/month rows carry slightly different field names, so
  // each onOpen maps them onto the shared builders (components/detail/adapters).
  const detail = useEntityDetail()
  const detailCtx: DetailCtx = { t, lang, members, recipeFor: useRecipeForMeal() }
  const openMeal = useOpenMeal(detailCtx)
  // Modify / Delete / Share on an event peek (gating + modals owned by the hook).
  const eventActions = useEventPeekActions()
  // — chore `who` is a NAME on the month payload; recover its id for the face. —
  const choreWhoId = (who: string | null) => (who ? members.find((m) => m.display_name === who)?.id ?? null : null)
  // Which month is shown, as an offset (in months) from the real current one.
  // Selected day drives the detail panel; it opens on today.
  const [offset, setOffset] = useState(initialOffset)
  const [selected, setSelected] = useState(todayDay)
  // « Voir ce moment » → the Moments scene for that day, ADAPTED for the special cases:
  // today opens its nicer « Ce soir » framing, tomorrow opens « Demain », any other
  // date deep-links the « Une date » scope. So the scene never shows a generic date
  // picker for today/tomorrow when a friendlier window exists.
  const momentHref = (day: number) =>
    day === todayDay
      ? '/moment?scope=tonight'
      : day === addLocalDays(todayDay, 1)
        ? '/moment?scope=tomorrow'
        : `/moment?scope=date&date=${day}`
  // À compléter todos marked done from the panel — DEFERRED behind the undo toast:
  // hidden at once so /api/month can't resurrect them before the PATCH commits, and
  // a tap of Annuler simply never marks it done (Liste's pendingClear pattern).
  const [pendingTodo, setPendingTodo] = useState<Set<string>>(new Set())

  // « Mes habitudes » — the day panel can now CHECK a habit for today or any past
  // day (backfill from the calendar), not just view the derived occurrence. Reads
  // the same HABITS_KEY cache the check-in scene uses (`live: false`: this is a
  // slow browse read, never added to the board's own poll — the free-tier lever).
  const ro = isGuest()
  const { data: habitsData } = useHabits({ live: false })
  const markHabit = useMarkHabit()
  const habitDays = habitsData?.days ?? []

  const grid = useMemo(() => {
    const { year, month } = localYMD(todayDay)
    return monthGrid(year, month + offset)
  }, [todayDay, offset])
  const from = grid.days[0]
  const to = grid.days[grid.days.length - 1] + DAY

  const { data, isLoading } = useQuery({
    queryKey: [...MONTH_KEY, from],
    queryFn: () => api<MonthData>(`month?from=${from}&to=${to}`),
    staleTime: 30_000,
  })

  // « L'auto » resolved across the visible range, so the day panel can show the
  // SELECTED date's car status (#28) — not a stuck "today" glance. A calm slow read
  // (staleTime, no live poll) like the month above: browsing isn't the glance surface.
  const { data: car } = useQuery({
    queryKey: [...CAR_KEY, from],
    queryFn: () => api<CarModel>(`car?from=${from}&to=${to}`),
    staleTime: 30_000,
  })

  // One pass to bucket everything by day. The cell dots and the detail panel both
  // read this map, so a thing can never show as a dot but go missing in the list.
  const byDay = useMemo(() => {
    const m = new Map<number, DayBucket>()
    const at = (d: number) => {
      let b = m.get(d)
      if (!b) {
        b = { events: [], meals: [], chores: [], notes: [], todos: [], home: [], habits: [] }
        m.set(d, b)
      }
      return b
    }
    for (const e of data?.events ?? []) at(e.day).events.push(e)
    for (const x of data?.meals ?? []) at(x.day).meals.push(x)
    for (const c of data?.chores ?? []) at(c.day).chores.push(c)
    for (const td of data?.todos ?? []) at(td.day).todos.push(td)
    for (const h of data?.homeProjects ?? []) at(h.day).home.push(h)
    // Private-ish, exactly as « Le point du jour » filters: the picked face sees the
    // household's habits plus their own; « Maisonnée » sees only the household's. A
    // member's habits never surface on the calendar for whoever is standing there.
    for (const h of data?.habits ?? [])
      if (h.member_id === null || h.member_id === face) at(h.day).habits.push(h)
    for (const n of data?.dayNotes ?? []) at(n.day).notes.push(n)
    return m
  }, [data, face])

  // Trip bands by day: each trip paints a strip across every visible day it covers,
  // rounded on its first/last day. Clamped to [from, to) so a trip running past the
  // grid edge still bands the days that ARE shown. A day can carry several bands
  // (overlapping trips) — they stack.
  const tripsByDay = useMemo(() => {
    const m = new Map<number, TripSpan[]>()
    for (const tr of data?.trips ?? []) {
      const first = Math.max(tr.start_at, from)
      const last = Math.min(tr.end_at, to - DAY)
      for (let d = first; d <= last; d = addLocalDays(d, 1)) {
        const arr = m.get(d) ?? []
        arr.push({ id: tr.id, title: tr.title, colour: tr.colour, isStart: d === tr.start_at, isEnd: d === tr.end_at, start_at: tr.start_at, shared: tr.shared })
        m.set(d, arr)
      }
    }
    return m
  }, [data, from, to])

  const mealPrefs = useMealPrefs()
  const slotLabel = (slot: string) => slotLabelFor(slot, t)
  const cookLine = (id: string | null) => {
    const who = nameOf(members, id)
    return who ? `${who} ${t.board.cooks}` : undefined
  }

  // Check an À compléter todo done straight from the calendar panel (the follow-up
  // to "Ouvrir la journée"). DEFERRED behind the undo toast, mirroring the board's
  // markTodoDone: hide it now (pendingTodo), hold the PATCH, and a tap of Annuler
  // leaves it open. /api/month only carries OPEN todos, so a committed one drops off
  // on the next month read; ['month'] is invalidated so that read happens.
  const markTodoDone = (td: MTodo) => {
    setPendingTodo((s) => new Set(s).add(td.id))
    undo({
      message: t.undo.todoDone(td.title),
      onUndo: () =>
        setPendingTodo((s) => {
          const n = new Set(s)
          n.delete(td.id)
          return n
        }),
      onCommit: async () => {
        await write('todos', { method: 'PATCH', body: { id: td.id, done: true }, affectedKeys: [TODOS_KEY, MONTH_KEY] }).catch(
          () => {},
        )
        // Wait for the month read to reflect the change before un-hiding, else the
        // stale cached frame (still holding the todo) flashes it back for a frame.
        await qc.refetchQueries({ queryKey: MONTH_KEY }).catch(() => {})
        setPendingTodo((s) => {
          const n = new Set(s)
          n.delete(td.id)
          return n
        })
      },
    })
  }

  const sel = byDay.get(selected)
  // Hidden meal slots (Réglages ▸ Repas) drop out of the day's detail list + count.
  const selMeals = sel ? sel.meals.filter((m) => mealPrefs.isVisible(m.slot)) : []
  // Todos just marked done are held out of the panel (and the count) at once.
  const selTodos = sel ? sel.todos.filter((td) => !pendingTodo.has(td.id)) : []
  // Trips covering the selected day — shown atop the panel as a tap into the trip.
  const selTrips = tripsByDay.get(selected) ?? []
  // The dated itinerary entries for the selected day, grouped under their trip below.
  const selTripPlans = (data?.tripPlans ?? []).filter((p) => p.day === selected)
  const selCount =
    (sel ? sel.events.length + selMeals.length + sel.chores.length + selTodos.length + sel.home.length + sel.habits.length + sel.notes.length : 0) +
    selTrips.length +
    selTripPlans.length

  // Habits get REAL marking controls on today/past (backfill from the calendar);
  // a future day, or a guest session, stays the read-only derived occurrence list
  // (sel.habits, from /api/month) with its usual tap-through to the scene. Any
  // face-visible habit is reachable for a past/today day, not just the due ones —
  // splitHabitsForDay (lib/habits) puts due-or-already-marked first, the rest
  // fold under « Autres habitudes » so the panel stays calm even for a household
  // with many habits.
  const habitsInteractive = selected <= todayDay && !ro
  const { due: dueOrMarkedHabits, other: otherHabits } = habitsInteractive
    ? splitHabitsForDay(habitsData?.habits ?? [], habitDays, face, selected)
    : { due: [], other: [] }
  const habitsPanelActive = habitsInteractive && dueOrMarkedHabits.length + otherHabits.length > 0
  const atToday = offset === 0 && selected === todayDay
  // Grid keys are LOCAL midnights now (monthgrid.ts), so labels render in local
  // time — the household's wall month/weekday, no UTC flag.
  const title = cap(formatMonthYear(grid.monthStart, lang))

  return (
    <div className="monthv">
      <div className="monthv__head">
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o - 1)} aria-label={t.monthView.prev}>
          <Icon name="caret-left-bold" size={20} />
        </button>
        <h2 className="monthv__title">{title}</h2>
        {/* « Aujourd'hui » — sits INSIDE the arrows (next to the title), while prev/next
            flank the whole row on the outer edges. ALWAYS mounted, only hidden when
            already on today: mounting it on demand shrank the flex:1 title and shifted
            the next button, so a rapid multi-tap to skip several months missed after the
            first tap. Reserving its slot keeps the next button fixed under the finger. */}
        <button
          type="button"
          className={'monthv__today' + (atToday ? ' is-hidden' : '')}
          disabled={atToday}
          aria-hidden={atToday}
          tabIndex={atToday ? -1 : undefined}
          onClick={() => {
            setOffset(0)
            setSelected(todayDay)
          }}
        >
          {t.monthView.today}
        </button>
        <button type="button" className="monthv__nav" onClick={() => setOffset((o) => o + 1)} aria-label={t.monthView.next}>
          <Icon name="caret-right-bold" size={20} />
        </button>
      </div>

      <div className="monthv__grid" role="grid" aria-label={title}>
        {grid.days.slice(0, 7).map((d) => (
          <div key={`h${d}`} className="monthv__dow mono" role="columnheader">
            {cap(weekdayShort(d, lang))}
          </div>
        ))}
        {grid.days.map((d) => {
          const b = byDay.get(d)
          const dots = dotsFor(b, members, mealPrefs)
          const cls =
            'monthv__cell' +
            (inMonth(d, grid.month) ? '' : ' is-out') +
            (d === todayDay ? ' is-today' : '') +
            (d === selected ? ' is-on' : '')
          return (
            <button key={d} type="button" role="gridcell" aria-selected={d === selected} className={cls} onClick={() => setSelected(d)}>
              <span className="monthv__num">{localYMD(d).day}</span>
              {dots.length > 0 && (
                <span className="monthv__dots" aria-hidden="true">
                  {dots.slice(0, 4).map((dot, i) =>
                    dot.kind === 'meal' && dot.slot ? (
                      // Meal → its slot icon, tinted with the slot colour (Réglages ▸ Repas).
                      <span key={i} className="monthv__dot-icon">
                        <Icon name={SLOT_ICON_NAME[dot.slot]} size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'todo' ? (
                      // À compléter → a check icon tinted with the member colour.
                      <span key={i} className="monthv__dot-icon">
                        <Icon name="check-bold" size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'birthday' ? (
                      // A derived birthday → a cake, tinted with the cercle rose.
                      <span key={i} className="monthv__dot-icon">
                        <Icon name="cake-bold" size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'work' ? (
                      // A derived « L'auto » work window → a clock, tinted by the member.
                      <span key={i} className="monthv__dot-icon">
                        <Icon name="clock-bold" size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'habit' ? (
                      // A derived habit → the repeat glyph in the habit's own tint,
                      // softened while the day is still open (never a red "missed").
                      <span key={i} className="monthv__dot-icon" style={{ opacity: dot.done ? 1 : 0.45 }}>
                        <Icon name="repeat-bold" size={12} color={dot.color} />
                      </span>
                    ) : (
                      <span
                        key={i}
                        className={`monthv__dot monthv__dot--${dot.kind}`}
                        // A ring (note) is drawn from `color`; filled shapes from `background`.
                        style={dot.kind === 'note' ? { color: dot.color } : { background: dot.color }}
                      />
                    ),
                  )}
                  {dots.length > 4 && <span className="monthv__more mono">+{dots.length - 4}</span>}
                </span>
              )}
              {/* « Voyage » bands — thin strips pinned to the cell BOTTOM (absolute, so
                  they never push the number/dots), one per covering trip, rounded on the
                  trip's first/last day. */}
              {(() => {
                const bands = tripsByDay.get(d) ?? []
                return bands.length > 0 ? (
                  <span className="monthv__bands" aria-hidden="true">
                    {bands.slice(0, 3).map((tr) => (
                      <span
                        key={tr.id}
                        className={'monthv__band' + (tr.isStart ? ' is-start' : '') + (tr.isEnd ? ' is-end' : '')}
                        style={{ background: tr.colour }}
                      />
                    ))}
                  </span>
                ) : null
              })()}
            </button>
          )
        })}
      </div>

      {/* Shape key: the dots are shape-coded, so a small legend tells a glance which
          shape is a chore vs a meal vs an event. Neutral swatches — it's about the
          SHAPE here, not the colour (colour carries who/which-slot in the cells). */}
      <div className="monthv__legend" aria-hidden="true">
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--event" style={{ background: 'var(--ink-soft)' }} /> {t.monthView.legendEvents}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot-icon">
            <Icon name={SLOT_ICON_NAME[mealPrefs.hero]} size={12} color="var(--ink-soft)" />
          </span>{' '}
          {t.monthView.legendMeals}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--chore" style={{ background: 'var(--ink-soft)' }} /> {t.monthView.legendChores}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot-icon">
            <Icon name="check-bold" size={12} color="var(--ink-soft)" />
          </span>{' '}
          {t.monthView.legendTodos}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__dot monthv__dot--note" style={{ color: 'var(--ink-soft)' }} /> {t.monthView.legendNotes}
        </span>
        <span className="monthv__legend-item">
          <span className="monthv__legend-band" style={{ background: 'var(--ink-soft)' }} /> {t.voyage.legendTrips}
        </span>
      </div>

      <div className="monthv__day">
        <div className="monthv__day-h">
          <b>{cap(formatDayLong(selected, lang))}</b>
          <div className="monthv__day-actions">
            {/* « Planifier cette journée » — into the full day editor (/kitchen/day/:date)
                to add/modify that day's meals + rendez-vous + corvées + note. The action
                surface next to « Voir ce moment »'s calm read. */}
            <button
              type="button"
              className="btn btn--ghost btn--sm mono monthv__open-day"
              onClick={() => nav(`/kitchen/day/${selected}`)}
            >
              {t.detail.openDay} <Icon name="caret-right-bold" size={14} />
            </button>
            {/* « Voir ce moment » — open that date in « Moments » (its recap + handoff
                list + a place to act on the day). The calendar's one way into a specific
                day; deep-links via ?scope=date&date= so Moments lands on it. */}
            <button
              type="button"
              className="btn btn--ghost btn--sm mono monthv__open-day monthv__open-moment"
              onClick={() => nav(momentHref(selected))}
            >
              {t.monthView.openMoment} <Icon name="caret-right-bold" size={14} />
            </button>
          </div>
        </div>
        {/* « L'auto » for the SELECTED day — its status + rides follow the picked date
            (today shows the live status; another date summarizes that day's windows). */}
        {car && <AutoCardView model={car} day={selected} />}
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : selCount === 0 && !habitsPanelActive ? (
          <EmptyState>{t.monthView.empty}</EmptyState>
        ) : (
          <>
            {/* « Voyage » covering this day — atop the list, tapping into the trip,
                followed by the dated itinerary entries written for the day (the actual
                plans, not just the global trip band). */}
            {selTrips.map((tr) => {
              // « Jour N » — 1-based day-of-trip for the selected date, mirroring
              // DayPlanPage's tripDayNum (both dates are local-midnight; round absorbs DST).
              const jour = Math.round((selected - tr.start_at) / DAY) + 1
              // A « Voyage partagé » (promoted/joined) taps into the shared scene; the sub-tab
              // param (`vue`/`jour`) is read identically there (SharedVoyagePage reuses VoyageItinerary).
              const base = tr.shared ? `/voyage/partage/${tr.id}` : `/voyage/${tr.id}`
              return (
                <div key={tr.id} className="day-plan__trip">
                  <Act
                    cat="event"
                    title={`${t.voyage.title} · ${tr.title}`}
                    when={t.voyage.dayN(jour)}
                    color={tr.colour}
                    // « Partagé » marker only here (the panel list shows text), never on the
                    // month grid band — the band colour + title carry it there (calm).
                    badge={
                      tr.shared ? (
                        <span className="act__sharedmark" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
                          <Icon name="users-three-bold" size={13} />
                        </span>
                      ) : undefined
                    }
                    onActivate={() => nav(`${base}?vue=itineraire`)}
                  />
                  {selTripPlans
                    .filter((p) => p.trip_id === tr.id)
                    .map((p) => (
                      <Act
                        key={p.id}
                        cat="event"
                        icon={tripCategoryIcon(p.category as TripCategory)}
                        title={p.label || p.text || t.voyage.cat[p.category as TripCategory]}
                        who={p.label && p.text ? p.text : undefined}
                        color={p.colour}
                        // Deep-link to this exact day: `&jour=N` (1-based day-of-trip) lands on
                        // that day's section inside the itinerary instead of its top.
                        onActivate={() => nav(`${base}?vue=itineraire&jour=${jour}`)}
                      />
                    ))}
                </div>
              )
            })}
            {/* Same order, same cards as the bento day: meals, then events, then
                chores, then the day note — so nothing dated is represented here
                differently than on the day view. */}
            {selMeals.map((m) => (
              <Act
                key={m.id}
                cat="meal"
                icon={SLOT_ICON_NAME[m.slot as MealSlot]}
                title={`${slotLabel(m.slot)} · ${m.title}`}
                who={cookLine(m.cook_member_id)}
                color={mealPrefs.color(m.slot)}
                onOpen={() => openMeal(m, { color: mealPrefs.color(m.slot), slotLabel: slotLabel(m.slot), daySec: selected })}
              />
            ))}
            {(sel?.events ?? []).map((e) =>
              e.work ? (
                // A derived « L'auto » work window — read-only; tapping opens the car
                // week view (where the schedule is tuned), never an event editor.
                <Act
                  key={e.id}
                  cat="work"
                  title={e.title || t.auto.work}
                  when={t.auto.range(formatTime(e.at, lang), e.end != null ? formatTime(e.end, lang) : '')}
                  who={nameOf(members, e.member_id) ?? undefined}
                  color={e.color ?? colorOf(members, e.member_id) ?? undefined}
                  onActivate={() => nav('/voiture')}
                />
              ) : (
                <Act
                  key={e.id}
                  cat={e.birthday ? 'birthday' : 'event'}
                  title={e.title}
                  when={e.birthday ? (e.age != null ? t.cercle.turnsN(e.age) : t.board.birthday) : e.all_day ? t.board.allDay : formatTime(e.at, lang)}
                  who={e.business_name ?? e.contact_name ?? nameOf(members, e.member_id) ?? undefined}
                  color={e.business_colour ?? colorOf(members, e.member_id) ?? undefined}
                  onOpen={() =>
                    detail.open(
                      buildEvent(
                        { id: e.id, title: e.title, start_at: e.at, all_day: e.all_day, member_id: e.member_id, contact_name: e.contact_name, business_id: e.business_id, business_name: e.business_name, business_colour: e.business_colour, birthday: e.birthday, age: e.age },
                        detailCtx,
                        eventActions.optsFor({ id: e.id, title: e.title, birthday: e.birthday }),
                      ),
                    )
                  }
                />
              ),
            )}
            {(sel?.chores ?? []).map((c) => (
              <Act
                key={c.id}
                cat="chore"
                title={c.title}
                who={c.who ?? undefined}
                color={c.color ?? undefined}
                onOpen={() =>
                  detail.open(buildChore({ id: c.id, title: c.title, color: c.color, at: c.day, who: c.who, who_id: choreWhoId(c.who) }, detailCtx))
                }
              />
            ))}
            {/* Projets & Entretien landing on this day — read-only peek (managed in
                Réglages); tap opens the same chore-style detail. */}
            {(sel?.home ?? []).map((h) => (
              <Act
                key={h.id}
                cat="chore"
                title={h.title}
                color={h.color ?? undefined}
                onOpen={() => detail.open(buildChore({ id: h.id, title: h.title, color: h.color, at: h.day, who: null, who_id: null }, detailCtx))}
              />
            ))}
            {/* À compléter todos pinned to this day — check them off right here (the
                check is its own tap target); tap the rest of the row to open the day
                page. The source list, if any, rides as the sub-line. */}
            {selTodos.map((td) => (
              <Act
                key={td.id}
                cat="chore"
                icon="check-bold"
                title={td.title}
                who={td.section ?? undefined}
                color={colorOf(members, td.member_id) ?? undefined}
                onCheck={() => markTodoDone(td)}
                onOpen={() => nav(momentHref(selected))}
              />
            ))}
            {/* « Mes habitudes » landing on this day. TODAY/PAST (not a guest): real
                per-kind marking rows — any face-visible habit is reachable for the
                day (backfill), not just the ones due then; due-or-marked lead, the
                rest fold under « Autres habitudes ». FUTURE (or a guest): stays the
                read-only derived occurrence (like a birthday), tap → the scene. */}
            {habitsInteractive ? (
              habitsPanelActive && (
                <div className="monthv__habits">
                  {dueOrMarkedHabits.length > 0 && (
                    <div className="habitudes__list">
                      {dueOrMarkedHabits.map((h) => (
                        <HabitRow
                          key={h.id}
                          habit={h}
                          status={habitStatusOn(h, habitDays, selected)}
                          onMark={(next) => markHabit(h, selected, next)}
                        />
                      ))}
                    </div>
                  )}
                  {otherHabits.length > 0 && (
                    <Disclosure label={t.habits.otherHabits} count={otherHabits.length} className="monthv__habits-other">
                      <div className="habitudes__list">
                        {otherHabits.map((h) => (
                          <HabitRow
                            key={h.id}
                            habit={h}
                            status={habitStatusOn(h, habitDays, selected)}
                            onMark={(next) => markHabit(h, selected, next)}
                          />
                        ))}
                      </div>
                    </Disclosure>
                  )}
                </div>
              )
            ) : (
              (sel?.habits ?? []).map((h) => (
                <Act
                  key={h.id}
                  cat="routine"
                  icon="repeat-bold"
                  title={`${h.icon ? h.icon + ' ' : ''}${h.title}`}
                  who={h.done ? t.habits.doneToday : undefined}
                  done={h.done}
                  color={h.colour ?? undefined}
                  onOpen={() => nav('/board/habitudes')}
                />
              ))
            )}
            {(sel?.notes ?? []).map((n) => (
              <DayNote key={n.id} note={n} members={members} />
            ))}
          </>
        )}
      </div>
      {eventActions.node}
    </div>
  )
}
