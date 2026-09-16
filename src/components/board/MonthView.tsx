import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { LoadError } from '../LoadError'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useProfile } from '../../lib/profile'
import { useUndoToast } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { TODOS_KEY, MONTH_KEY, CAR_KEY } from '../../lib/queryKeys'
import { healOnError } from '../../lib/query'
import { type CarModel } from '../../lib/car'
import { formatTime, formatMonthYear, formatDay, formatDayLong, weekdayShort, dayNum, capitalize as cap } from '../../lib/format'
import { monthGrid, inMonth, stepMonthDay } from '../../lib/monthgrid'
import { localYMD, localDayStart } from '../../lib/localDay'
import { SLOT_ICON_NAME, slotLabel as slotLabelFor, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs, type MealPrefs } from '../../lib/mealPrefs'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { type Lang } from '../../i18n'
import { Icon } from '../Icon'
import { Cluster } from '../Layout'
import { ActionMenu, type ActionMenuItem } from '../ActionMenu'
import { Act } from './Act'
import { DayMark } from './DayMark'
import { tripCategoryIcon, type TripCategory } from '../voyage/voyage'
import { AutoCardView } from './AutoCard'
import { DayNote } from './DayNote'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, buildChore, type DetailCtx } from '../detail/adapters'
import { eventMembers, memberFaces } from '../../lib/eventPeople'
import { useOpenMeal } from '../detail/useOpenMeal'
import { useEventPeekActions } from '../detail/EventPeekActions'
import { colorOf, nameOf, type Dict, type Member } from './types'
// THE shared day builder (extracted from this file, 2026-09-15). MonthView draws its
// lines as grid cells; WeekView draws the same lines as rows.
import {
  bucketByDay,
  markersFor,
  tripSpansByDay,
  type DayBucket,
  type DotKind,
  type MEvent,
  type MTodo,
  type MonthData,
} from './dayLines'
export type { MonthData } from './dayLines'

const DAY = 86400

// The /api/month payload: every dated thing, already bucketed onto a UTC `day`
// key by the server. Mirrors the families on the bento board so the calendar is a
// faithful "is it all here?" inventory — events, meals, recurring chores, notes.
// The payload types, the day bucketing and the marker walk now live in dayLines.ts
// (extracted 2026-09-15 so « La semaine » is the fourth FACE of the same builder
// rather than a fourth opinion about what a day holds). Re-exported below for the
// modules that already import MonthData from here.

// The marker/bucket types are dayLines.ts now — see the note above.

// ── The legend, which is ALSO a highlight lens ──────────────────────────────────────
// The shape key under the grid used to be pure decoration (aria-hidden, unclickable).
// Tapping one of its six entries now LIGHTS that kind: every day carrying it steps
// forward in the grid, everything else steps back, and the panel below swaps from "the
// picked day" to "this kind, all month" (see the panel's two faces). It is a READING
// lens, not a filter — nothing is removed from the calendar, the unlit markers just lose
// weight — so a month of rendez-vous reads as one list instead of thirty taps while the
// grid still says where they fall. Lives in the URL (`?type=`) beside `?date=`, so a lit
// calendar is a linkable place and survives a hop into a day page and back.
const LENS_KEYS = ['none', 'event', 'meal', 'chore', 'todo', 'note', 'trip'] as const
type LensParam = (typeof LENS_KEYS)[number]
type LensKey = Exclude<LensParam, 'none'>
// Which lens each cell marker answers to. Birthdays and « L'auto » work windows ride the
// SAME `events` payload and the legend never listed them apart, so « Rendez-vous » lights
// them too rather than leaving two glyph kinds unreachable. Habits are deliberately not
// cell markers at all (see the grid), so they have no lens.
const LENS_OF: Record<DotKind, LensKey | null> = {
  event: 'event',
  birthday: 'event',
  work: 'event',
  meal: 'meal',
  chore: 'chore',
  todo: 'todo',
  note: 'note',
  habit: null,
  // No lens: « Virements » is not one of the six reading categories under the grid,
  // and adding a seventh for it would put money in the legend of a wall calendar.
  transfer: null,
}

// How many things of ONE lit kind a day holds — the same slices the panel prints, so a
// day can never light up in the grid and then have nothing under its date in the roll-up.
// « Voyage » is absent on purpose: a trip spans days, so the roll-up lists each trip once
// rather than repeating it under every date it covers.
function lensCount(b: DayBucket | undefined, k: LensKey, meals: MealPrefs, pendingTodo: Set<string>): number {
  if (!b) return 0
  switch (k) {
    case 'event':
      return b.events.length
    case 'meal':
      return b.meals.filter((m) => meals.isVisible(m.slot)).length
    case 'chore':
      return b.chores.length + b.home.length
    case 'todo':
      return b.todos.filter((td) => !pendingTodo.has(td.id)).length
    case 'note':
      return b.notes.length
    default:
      return 0
  }
}

//  moved to dayLines.ts (imported above) — it is shared with WeekView now.

// "Mois" — the fourth board take (after bento · next · lanes): a calm six-week
// calendar of EVERYTHING dated, so a glance answers "what's the month look like?"
// Cells carry colour dots; tapping a day opens its full list below. Its own slow
// read (not the live board poll): browsing the month isn't the glance surface.
export function MonthView({
  members,
  lang,
  t,
  todayDay,
}: {
  members: Member[]
  lang: Lang
  t: Dict
  todayDay: number
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
  // ── Where you are in the calendar lives in the URL (`?date=<local-midnight secs>`) ──
  // It used to be two useStates, so a reload — or a hop to the day page and back, or an
  // event added from the ⋯ below — snapped you to today and lost the month you were
  // reading. One param drives BOTH the picked day and the month shown (the month is
  // DERIVED from the date, so the two can never disagree), which also makes a calendar day
  // a linkable place. Same contract as lib/tabParam: written with { replace: true } so
  // browsing months doesn't stack history, and the default (today) is stored as NO param.
  // `useTabParam` itself doesn't fit — it validates against a fixed list of strings.
  const [params, setParams] = useSearchParams()
  const dateParam = Number(params.get('date'))
  const selected = Number.isFinite(dateParam) && dateParam > 0 ? localDayStart(new Date(dateParam * 1000)) : todayDay
  // The legend's highlight lens (`?type=`), read the same forgiving way as `?date=`: an
  // unknown value is simply no lens. null = the plain calendar.
  const lensParam = params.get('type')
  const lens = ((LENS_KEYS as readonly string[]).includes(lensParam ?? '') ? lensParam : 'none') as LensParam
  const lit: LensKey | null = lens === 'none' ? null : lens
  // ONE writer for both params the calendar owns. Picking a day also clears the lens, and
  // two back-to-back setSearchParams calls would have the second read a `prev` that does
  // not yet carry the first (the location hasn't re-rendered) — silently undoing it. One
  // call, one URLSearchParams, both edits.
  const patchUrl = (patch: { date?: number; type?: LensParam }) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (patch.date !== undefined) {
          if (patch.date === todayDay) next.delete('date')
          else next.set('date', String(patch.date))
        }
        if (patch.type !== undefined) {
          if (patch.type === 'none') next.delete('type')
          else next.set('type', patch.type)
        }
        return next
      },
      { replace: true },
    )
  const setSelected = (d: number) => patchUrl({ date: d })
  // Months from the real current one — read off the picked day, never stored beside it.
  const selYMD = localYMD(selected)
  const nowYMD = localYMD(todayDay)
  const offset = (selYMD.year - nowYMD.year) * 12 + (selYMD.month - nowYMD.month)
  // Stepping a month keeps the day-of-month where it can (the 31st of a 30-day month
  // lands on its last day), so ‹ › walk the calendar rather than resetting the pick.
  // The arithmetic is pure and unit-tested in lib/monthgrid.
  const stepMonth = (by: number) => setSelected(stepMonthDay(selected, by))
  // The six-week grid is tall, so on a phone/tablet the day panel below it starts off
  // screen — you'd tap a date and see nothing change. Below 900px the panel is PINNED to
  // the bottom of the screen (month.css), which covers the normal case; this stays for the
  // two-column layout, where nothing is pinned and the panel can sit above the fold.
  // `block: 'nearest'` means it only moves when the panel is actually out of sight, so
  // tapping a second date while already reading the panel does nothing jarring.
  const dayPanelRef = useRef<HTMLDivElement>(null)
  // A tapped day can be UNTAPPED. The pick used to be one-way: once a date was open
  // there was no way back to a plain calendar except picking a different day, and the
  // panel stayed pinned over the bottom of the grid for the rest of the visit.
  //
  // Kept as LOCAL state rather than another URL param: which day you're reading is a
  // linkable place (?date=), but whether its drawer is open right now is not — a
  // ?date= deep-link still lands with the day open, which is the whole point of the
  // link. Picking any OTHER day re-opens it; tapping the open one closes it.
  const [dayOpen, setDayOpen] = useState(true)
  const revealPanel = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    dayPanelRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }
  const pickDay = (d: number) => {
    // Untapping only applies to the plain calendar. With a lens lit the panel below is
    // the month roll-up, so tapping a date means "show me THIS day" — it drops the lens
    // and opens the day, never folds something the tap wasn't about.
    if (!lit && d === selected && dayOpen) {
      setDayOpen(false)
      return
    }
    patchUrl({ date: d, type: 'none' })
    setDayOpen(true)
    revealPanel()
  }
  // Tap a legend entry to light its kind; tap the lit one (or the panel's ✕) to go back
  // to the plain calendar. The panel is force-opened: the lens has nowhere to show itself
  // if the day drawer happens to be folded away.
  const toggleLens = (k: LensKey) => {
    patchUrl({ type: lens === k ? 'none' : k })
    setDayOpen(true)
    revealPanel()
  }

  // The pinned day drawer, folded away to read the grid under it. Narrow screens only —
  // the two-column layout has nothing to reclaim and hides the caret (month.css).
  const [folded, setFolded] = useState(false)
  // À compléter todos marked done from the panel — DEFERRED behind the undo toast:
  // hidden at once so /api/month can't resurrect them before the PATCH commits, and
  // a tap of Annuler simply never marks it done (Liste's pendingClear pattern).
  const [pendingTodo, setPendingTodo] = useState<Set<string>>(new Set())

  const ro = isGuest()
  // The event + chore forms are FormScenes, which bounce a device that isn't signed in —
  // so an unsigned kiosk must not be offered them (the same gate AddSheet applies via
  // OPERATOR_MODES). The day page is not a FormScene, so its two entries stay.
  const { signedIn } = useAuth()

  const grid = useMemo(() => monthGrid(selYMD.year, selYMD.month), [selYMD.year, selYMD.month])
  const from = grid.days[0]
  const to = grid.days[grid.days.length - 1] + DAY

  // healOnError: this surface has no poll, so before it a failed window sat blank
  // until the one manual « Réessayer » tap (ddf0a4e) — now it also heals itself.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...MONTH_KEY, from],
    queryFn: () => api<MonthData>(`month?from=${from}&to=${to}`),
    staleTime: 30_000,
    ...healOnError,
  })

  // « L'auto » resolved across the visible range, so the day panel can show the
  // SELECTED date's car status (#28) — not a stuck "today" glance. A calm slow read
  // (staleTime, no live poll) like the month above: browsing isn't the glance surface.
  const { data: car } = useQuery({
    queryKey: [...CAR_KEY, from],
    queryFn: () => api<CarModel>(`car?from=${from}&to=${to}`),
    staleTime: 30_000,
    ...healOnError,
  })

  // One pass to bucket everything by day. The cell dots and the detail panel both
  // read this map, so a thing can never show as a dot but go missing in the list.
  // One pass to bucket everything by day (dayLines.bucketByDay). The cell dots, the
  // detail panel and « La semaine » all read this same map, so a thing can never show
  // as a dot on one surface and go missing on another.
  const byDay = useMemo(() => bucketByDay(data, face), [data, face])

  // Trip bands by day: each trip paints a strip across every visible day it covers,
  // rounded on its first/last day. Clamped to [from, to) so a trip running past the
  // grid edge still bands the days that ARE shown. A day can carry several bands
  // (overlapping trips) — they stack.
  const tripsByDay = useMemo(() => tripSpansByDay(data?.trips, from, to), [data, from, to])

  const mealPrefs = useMealPrefs()
  const slotLabel = (slot: string) => slotLabelFor(slot, t)
  const cookLine = (id: string | null) => {
    const who = nameOf(members, id)
    return who ? `${who} ${t.board.cooks}` : undefined
  }
  // « Qui » faces for an event row — only when SEVERAL people share it (a solo one
  // keeps its plain name; the peek lists everyone).
  const eventFaces = (e: MEvent) => {
    const f = memberFaces(eventMembers(e), members)
    return f.length > 1 ? f : undefined
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
  // Habits the day actually SAW DONE — the only ones the calendar names (see the panel
  // below). `sel.habits` is the derived per-day occurrence from /api/month (a scheduled
  // habit emits every due day, a week-quota one only the days it was done), so filtering
  // on `done` leaves exactly "what we did that day" for today, a past date and a future
  // one alike — no read-only/guest fork, no second source of truth.
  const selHabitsDone = (sel?.habits ?? []).filter((h) => h.done)
  // What the panel will actually PRINT. It gates the « rien ce jour-là » empty state,
  // so every kind `dayRows` renders has to be counted here or a day reads as empty
  // while listing things. `sel.transfers` was the one that got away (PARITY D2, 2026-09-15).
  const selCount =
    (sel
      ? sel.events.length +
        selMeals.length +
        sel.chores.length +
        selTodos.length +
        sel.home.length +
        sel.notes.length +
        sel.transfers.length
      : 0) +
    selHabitsDone.length +
    selTrips.length +
    selTripPlans.length

  // The ⋯ items for the picked day. Built here so the gating reads in one place: every
  // ADD is a write, so a read-only guest gets none (and the ⋯ vanishes); the two
  // FormScene routes additionally need a signed-in operator, exactly as the ＋ sheet's
  // OPERATOR_MODES filter does, so an unsigned kiosk is never sent into a bounce.
  const dayAdds: ActionMenuItem[] = ro
    ? []
    : [
        ...(signedIn
          ? ([
              {
                icon: 'calendar-blank-bold',
                label: t.operator.addEvent,
                onSelect: () => nav(`/event/new?date=${selected}`),
              },
              { icon: 'hand-heart-bold', label: t.operator.addChore, onSelect: () => nav(`/chore/new?start=${selected}`) },
            ] as ActionMenuItem[])
          : []),
        // Both land ON their target, not merely on the page that contains it: the day
        // scene's `?focus=` opens the composer you asked for (see DayPlanPage). Asking
        // for « Note du jour » and then having to find the note field is the door doing
        // half its job.
        {
          icon: 'fork-knife-bold',
          label: t.kitchen.planMeal,
          onSelect: () => nav(`/kitchen/day/${selected}?vue=repas&focus=meal`),
        },
        { icon: 'pencil-simple-bold', label: t.kitchen.note, onSelect: () => nav(`/kitchen/day/${selected}?focus=note`) },
        // …and the one row that isn't an add: the door to « Le point du jour », where a
        // habit is marked, edited (RowActions ▸ ✎) or created. The panel below only
        // RECORDS what was done, so this is the calendar's way back to the habits
        // themselves — `separated`, so it reads apart from the four adds above it.
        {
          icon: 'repeat-bold',
          label: t.habits.manage,
          separated: true,
          onSelect: () => nav('/board/habitudes'),
        },
      ]
  // ── The panel's ONE row renderer ────────────────────────────────────────────────────
  // The bottom pane has two faces — the picked DAY, and a legend lens's month ROLL-UP —
  // and both print the same rows in the same order, with the same peeks, the same check
  // -with-undo, the same colours. One renderer behind both, so a rendez-vous can never
  // behave differently depending on which face named it. `only` narrows to a single
  // legend kind (the roll-up); null prints everything (the day).
  const dayRows = (day: number, only: LensKey | null) => {
    const b = byDay.get(day)
    const show = (k: LensKey) => only === null || only === k
    const meals = show('meal') ? (b?.meals ?? []).filter((m) => mealPrefs.isVisible(m.slot)) : []
    const events = show('event') ? b?.events ?? [] : []
    const chores = show('chore') ? b?.chores ?? [] : []
    const home = show('chore') ? b?.home ?? [] : []
    const todos = show('todo') ? (b?.todos ?? []).filter((td) => !pendingTodo.has(td.id)) : []
    // Habits are a RECORD of the day, not one of the legend's six kinds (they are not
    // cell markers either) — so only the day face lists them.
    const habits = only === null ? (b?.habits ?? []).filter((h) => h.done) : []
    const notes = show('note') ? b?.notes ?? [] : []
    // « Les virements » — like habits, NOT one of the legend's six kinds (LENS_OF maps
    // it to null), so only the day face lists them and a lit lens never claims them.
    // They ARE cell markers, though, which is why they must appear here — and this
    // had been broken since 0126 shipped: the due date draws a receipt glyph in the
    // cell (linesFor emits it) and the panel never listed or counted it, so a day
    // whose only dated thing was a payment read « rien ce jour-là » under its own
    // marker. Found by dayFaces.test.ts on its first run, 2026-09-15.
    const transfers = only === null ? (b?.transfers ?? []) : []
    return (
      <>
        {/* Same order, same cards as the bento day: meals, then events, then
            chores, then the day note — so nothing dated is represented here
            differently than on the day view. */}
        {meals.map((m) => (
          <Act
            key={m.id}
            cat="meal"
            icon={SLOT_ICON_NAME[m.slot as MealSlot]}
            title={`${slotLabel(m.slot)} · ${m.title}`}
            who={cookLine(m.cook_member_id)}
            color={mealPrefs.color(m.slot)}
            onOpen={() => openMeal(m, { color: mealPrefs.color(m.slot), slotLabel: slotLabel(m.slot), daySec: day })}
          />
        ))}
        {events.map((e) =>
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
              whoFaces={eventFaces(e)}
              color={e.business_colour ?? colorOf(members, e.member_id) ?? undefined}
              // 🚗 when this rendez-vous takes the shared car — same cue as a
              // work window that holds it (the row just above), so the calendar
              // and the board say "the car is spoken for" the same way.
              icon={e.car_id ? 'car-bold' : undefined}
              onOpen={() =>
                detail.open(
                  buildEvent(
                    { id: e.id, title: e.title, start_at: e.at, all_day: e.all_day, end_at: e.end_at, car_id: e.car_id, member_id: e.member_id, passengers: e.passengers, contact_name: e.contact_name, contact_address: e.contact_address, business_id: e.business_id, business_name: e.business_name, business_colour: e.business_colour, business_address: e.business_address, birthday: e.birthday, age: e.age },
                    detailCtx,
                    eventActions.optsFor({ id: e.id, title: e.title, birthday: e.birthday }),
                  ),
                )
              }
            />
          ),
        )}
        {chores.map((c) => (
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
        {home.map((h) => (
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
        {todos.map((td) => (
          <Act
            key={td.id}
            cat="chore"
            icon="check-bold"
            title={td.title}
            who={td.section ?? undefined}
            color={colorOf(members, td.member_id) ?? undefined}
            onCheck={() => markTodoDone(td)}
            onOpen={() => nav(`/kitchen/day/${day}`)}
          />
        ))}
        {/* « Mes habitudes » on this day — a RECORD, not a check-in: only the
            habits actually DONE that day, read-only, exactly like a birthday or a
            work window. The panel used to carry full per-kind marking rows for
            today and any past day, which put « Encore un » / « C'est fait »
            buttons under a date you were merely browsing, and named every
            unfinished intention on every square you tapped — a calendar answers
            "what happened", not "what do you still owe". Marking (and backfilling
            a forgotten day, through the habit's own week of dots) lives in « Le
            point du jour », one tap away through this row or through the ⋯ above. */}
        {habits.map((h) => (
          <Act
            key={h.id}
            cat="routine"
            icon="repeat-bold"
            title={`${h.icon ? h.icon + ' ' : ''}${h.title}`}
            // Day-neutral (« Fait », never « Fait aujourd'hui »): this same row
            // renders for a date weeks back. Never a count, never a rank (calm).
            who={t.habits.doneOnDay}
            done
            color={h.colour ?? undefined}
            onOpen={() => nav('/board/habitudes')}
          />
        ))}
        {/* A due date, by NAME only — no amount, per 0126's own rule: this line rides
            a kitchen wall tablet and the number does not. The tap goes to the tab,
            which is what the endpoint's comment always said it would. */}
        {transfers.map((tr) => (
          <Act
            key={tr.id}
            cat="event"
            icon="receipt-bold"
            title={tr.title}
            color={tr.colour ?? undefined}
            onOpen={() => nav('/notes?section=virements')}
          />
        ))}
        {notes.map((n) => (
          <DayNote key={n.id} note={n} members={members} />
        ))}
      </>
    )
  }

  // « Voyage » is its own shape: a trip SPANS days, so the day face lists the trips
  // covering that date (plus the itinerary written for it), while the roll-up lists each
  // trip once — repeating a two-week trip under fourteen dates would be noise, not a list.
  const dayTrips = (day: number) => {
    const trips = tripsByDay.get(day) ?? []
    const plans = (data?.tripPlans ?? []).filter((p) => p.day === day)
    return (
      <>
        {/* « Voyage » covering this day — atop the list, tapping into the trip,
            followed by the dated itinerary entries written for the day (the actual
            plans, not just the global trip band). */}
        {trips.map((tr) => {
          // « Jour N » — 1-based day-of-trip for this date, mirroring
          // DayPlanPage's tripDayNum (both dates are local-midnight; round absorbs DST).
          const jour = Math.round((day - tr.start_at) / DAY) + 1
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
                    <span className="act__sharedmark" role="img" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
                      <Icon name="users-three-bold" size={13} />
                    </span>
                  ) : undefined
                }
                onActivate={() => nav(`${base}?vue=itineraire`)}
              />
              {plans
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
      </>
    )
  }

  // The legend's six entries, in the grid's own reading order. Built here because one of
  // the swatches needs live state (the hero meal slot's icon, per Réglages ▸ Repas).
  const LEGEND: { key: LensKey; label: string; swatch: ReactNode }[] = [
    {
      key: 'event',
      label: t.monthView.legendEvents,
      swatch: <span className="monthv__dot monthv__dot--event" style={{ background: 'var(--ink-soft)' }} />,
    },
    {
      key: 'meal',
      label: t.monthView.legendMeals,
      swatch: (
        <span className="monthv__dot-icon">
          <Icon name={SLOT_ICON_NAME[mealPrefs.hero]} size={12} color="var(--ink-soft)" />
        </span>
      ),
    },
    {
      key: 'chore',
      label: t.monthView.legendChores,
      swatch: <span className="monthv__dot monthv__dot--chore" style={{ background: 'var(--ink-soft)' }} />,
    },
    {
      key: 'todo',
      label: t.monthView.legendTodos,
      swatch: (
        <span className="monthv__dot-icon">
          <Icon name="check-bold" size={12} color="var(--ink-soft)" />
        </span>
      ),
    },
    {
      key: 'note',
      label: t.monthView.legendNotes,
      swatch: <span className="monthv__dot monthv__dot--note" style={{ color: 'var(--ink-soft)' }} />,
    },
    {
      key: 'trip',
      label: t.voyage.legendTrips,
      swatch: <span className="monthv__legend-band" style={{ background: 'var(--ink-soft)' }} />,
    },
  ]
  const lensLabel = LEGEND.find((it) => it.key === lit)?.label ?? ''

  // The days of THIS month that carry the lit kind, in date order — the roll-up's spine.
  // Out-of-month squares are excluded (the grid doesn't light them either): the roll-up
  // says « ce mois-ci », and the neighbouring month is one ‹ › away.
  const lensDays = useMemo(
    () =>
      lit && lit !== 'trip'
        ? grid.days.filter((d) => inMonth(d, grid.month) && lensCount(byDay.get(d), lit, mealPrefs, pendingTodo) > 0)
        : [],
    // mealPrefs is rebuilt every render; its VISIBILITY set is the only part read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lit, grid, byDay, pendingTodo, mealPrefs.visibleSlots],
  )
  // Every trip touching the shown window — the « Voyages » lens's whole list.
  const monthTrips = data?.trips ?? []

  const atToday = offset === 0 && selected === todayDay
  // Grid keys are LOCAL midnights now (monthgrid.ts), so labels render in local
  // time — the household's wall month/weekday, no UTC flag.
  const title = cap(formatMonthYear(grid.monthStart, lang))

  return (
    <div className="monthv">
      <div className="monthv__head">
        <button type="button" className="monthv__nav" onClick={() => stepMonth(-1)} aria-label={t.monthView.prev}>
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
          onClick={() => setSelected(todayDay)}
        >
          {t.monthView.today}
        </button>

        <button type="button" className="monthv__nav" onClick={() => stepMonth(1)} aria-label={t.monthView.next}>
          <Icon name="caret-right-bold" size={20} />
        </button>
      </div>

      {/* A data-less month whose fetch FAILED: the grid below draws with every
          cell blank, which read as « long loading » / an empty month on flaky
          wifi — say it once here, with the hand back. */}
      {!data && isError && <LoadError onRetry={() => void refetch()} />}

      <div className="monthv__grid" role="grid" aria-label={title}>
        {grid.days.slice(0, 7).map((d) => (
          <div key={`h${d}`} className="monthv__dow mono" role="columnheader">
            {cap(weekdayShort(d, lang))}
          </div>
        ))}
        {grid.days.map((d) => {
          const b = byDay.get(d)
          // The marker walk: habits are deliberately NOT cell markers (why: `markersFor`
          // in dayLines — the same rule « La semaine » reads, so the two glances agree).
          // The legend never listed them here in the first place.
          const marks = markersFor(b, members, mealPrefs, t, lang)
          // EVERY cell keeps the grid's shape. The tapped day used to grow and float a
          // wide tile over its neighbours, spelling its items out — which meant the
          // calendar changed shape under the finger, the tile covered the days around
          // it, and it needed edge-detection (popstart/popend) to avoid hanging off the
          // board. The day PANEL below already says all of that, with room for the full
          // names and with everything you can DO with the day. A tapped cell is simply
          // the lit one now.
          const on = d === selected && dayOpen
          const inM = inMonth(d, grid.month)
          const bands = tripsByDay.get(d) ?? []
          // ── Under a legend lens ─────────────────────────────────────────────────────
          // The lit kind's markers come FIRST, so the four-marker cut can never hide the
          // very thing you asked to see, and the cell itself either steps forward (it has
          // one) or back (it doesn't). Out-of-month cells never light: the roll-up below
          // lists THIS month, and a lit trailing square with no row under it would lie.
          const litMarks = lit && lit !== 'trip' && inM ? marks.filter((m) => LENS_OF[m.kind] === lit) : []
          const hit = lit === 'trip' ? inM && bands.length > 0 : litMarks.length > 0
          const shown = lit ? [...litMarks, ...marks.filter((m) => !litMarks.includes(m))] : marks
          // A marker's weight under the lens. No lens → no class at all, so an unlit
          // calendar renders exactly the markup it always did.
          const mk = (k: DotKind) => (!lit ? '' : inM && LENS_OF[k] === lit ? ' is-lit' : ' is-dim')
          const bandCls = !lit ? '' : lit === 'trip' && inM ? ' is-lit' : ' is-dim'
          const cls =
            'monthv__cell' +
            (inM ? '' : ' is-out') +
            (d === todayDay ? ' is-today' : '') +
            (on && !lit ? ' is-on' : '') +
            (lit ? (hit ? ' is-lit' : ' is-dim') : '')
          return (
            <button key={d} type="button" role="gridcell" aria-selected={on} className={cls} onClick={() => pickDay(d)}>
              <span className="monthv__num">{localYMD(d).day}</span>
              {shown.length > 0 && (
                <span className="monthv__dots" aria-hidden="true">
                  {/* One marker each, via the shared <DayMark> — the same glyph
                      vocabulary « La semaine » draws (see DayMark.tsx). */}
                  {shown.slice(0, 4).map((dot, i) => (
                    <DayMark key={i} dot={dot} className={mk(dot.kind)} />
                  ))}
                  {shown.length > 4 && <span className="monthv__more">+{shown.length - 4}</span>}
                </span>
              )}
              {/* « Voyage » bands — thin strips pinned to the cell BOTTOM (absolute, so
                  they never push the number/dots), one per covering trip, rounded on the
                  trip's first/last day. */}
              {bands.length > 0 && (
                <span className="monthv__bands" aria-hidden="true">
                  {bands.slice(0, 3).map((tr) => (
                    <span
                      key={tr.id}
                      className={'monthv__band' + (tr.isStart ? ' is-start' : '') + (tr.isEnd ? ' is-end' : '') + bandCls}
                      style={{ background: tr.colour }}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Shape key AND the highlight lens: the dots are shape-coded, so this tells a
          glance which shape is a chore vs a meal vs an event — and tapping one lights
          that kind across the whole month (see LENS_KEYS above). Neutral swatches: it's
          about the SHAPE here, not the colour (colour carries who/which-slot in the
          cells). A Cluster, never a hand-rolled flex row — .monthv__legend keeps its own
          tightened gap/font on top (month.css is imported after core.css). */}
      <Cluster className="monthv__legend" role="group" aria-label={t.monthView.legendLens}>
        {LEGEND.map((it) => (
          <button
            key={it.key}
            type="button"
            className={
              'monthv__legend-item' + (lit === it.key ? ' is-on' : '') + (lit && lit !== it.key ? ' is-off' : '')
            }
            aria-pressed={lit === it.key}
            title={t.monthView.lensHint(it.label)}
            onClick={() => toggleLens(it.key)}
          >
            {it.swatch} {it.label}
          </button>
        ))}
      </Cluster>

      {/* The pane under the calendar, in its TWO faces: the picked day (its things, its
          doors), or — when a legend entry is lit — that kind's whole month, rolled up
          date by date. Untapping the open day closes the drawer; tapping any day (or the
          lens's ✕) brings it back. */}
      {dayOpen && (
      <div
        className={'monthv__day' + (folded ? ' monthv__day--folded' : '') + (lit ? ' monthv__day--lens' : '')}
        ref={dayPanelRef}
        aria-label={lit ? `${lensLabel} · ${title}` : cap(formatDayLong(selected, lang))}
      >
        <div className="monthv__day-h">
          <b>{lit ? `${lensLabel} · ${title}` : cap(formatDayLong(selected, lang))}</b>
          <Cluster className="monthv__day-tools">
            {/* Under a lens the two day doors make no sense — « Voir la journée » and the
                day's ⋯ adds both need ONE date, and the pane is showing a month. They are
                replaced by the one control the lens needs: put the calendar back. */}
            {lit && (
              <button
                type="button"
                className="monthv__day-btn monthv__lens-clear"
                onClick={() => patchUrl({ type: 'none' })}
                aria-label={t.monthView.lensClear}
                title={t.monthView.lensClear}
              >
                <Icon name="x-bold" size={16} />
              </button>
            )}
            {!lit && (
              <>
                {/* « Voir la journée » — the calendar's ONE door into a specific day: the full
                    day page (/kitchen/day/:date), where that day's meals, rendez-vous, corvées,
                    à compléter and note are all editable. It used to sit beside a « Voir ce
                    moment » twin that opened the same day read-only; « Moments » is retired. */}
                {/* Icon-only, like the ⋯ and the fold beside it: three little round buttons
                    reading as one row of controls, instead of one wide worded button that
                    made the header look like a form. The name lives on aria-label/title —
                    an icon button still has to SAY what it is to a screen reader. */}
                <button
                  type="button"
                  className="monthv__day-btn monthv__open-day"
                  onClick={() => nav(`/kitchen/day/${selected}`)}
                  aria-label={t.detail.openDay}
                  title={t.detail.openDay}
                >
                  <Icon name="calendar-blank-bold" size={16} />
                </button>
                {/* Everything you can ADD to the picked date, behind ONE ⋯. The calendar could
                    previously only READ a day — putting a rendez-vous on the 14th meant leaving
                    for the ＋ FAB and losing your place. Every target already exists and already
                    seeds itself from the date, so this wires no new form: /event/new?date= and
                    /chore/new?start= pre-fill (note the two param names differ), and the meal +
                    day-note both live on the day page. All four invalidate MONTH_KEY on save, so
                    coming back shows the new row. ActionMenu renders nothing on an empty list,
                    so the ⋯ simply disappears for a read-only guest. */}
                <ActionMenu label={t.monthView.dayActions} items={dayAdds} triggerClassName="monthv__day-btn" />
              </>
            )}
            {/* Fold the drawer away to read the grid under it. A real button, never a
                swipe — and hidden outright in the two-column layout, where the day sits
                beside the calendar and there is nothing to reclaim. */}
            <button
              type="button"
              className="monthv__day-btn monthv__day-fold"
              aria-expanded={!folded}
              aria-controls="monthv-day-body"
              aria-label={folded ? t.monthView.expandDay : t.monthView.collapseDay}
              title={folded ? t.monthView.expandDay : t.monthView.collapseDay}
              onClick={() => setFolded((f) => !f)}
            >
              <Icon name={folded ? 'caret-up-bold' : 'caret-down-bold'} size={16} />
            </button>
          </Cluster>
        </div>
        <div className="monthv__day-body" id="monthv-day-body">
        {isLoading && !data ? (
          <p className="loading mono">{t.common.loading}</p>
        ) : !data && isError ? (
          // A month whose fetch FAILED is not an empty month — saying « rien »
          // (or hanging on Chargement) lied on flaky wifi (2026-08-27).
          // No onRetry: the block above the grid already carries the one retry
          // door this screen gets, and offline it says so calmly — see LoadError.
          <LoadError />
        ) : lit === 'trip' ? (
          // « Voyages » — each trip in the window ONCE, with its span, not a copy under
          // every date it covers.
          monthTrips.length === 0 ? (
            <EmptyState>{t.monthView.lensEmpty}</EmptyState>
          ) : (
            monthTrips.map((tr) => (
              <Act
                key={tr.id}
                cat="event"
                title={`${t.voyage.title} · ${tr.title}`}
                when={`${formatDay(tr.start_at, lang)} → ${formatDay(tr.end_at, lang)}`}
                color={tr.colour}
                badge={
                  tr.shared ? (
                    <span className="act__sharedmark" role="img" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
                      <Icon name="users-three-bold" size={13} />
                    </span>
                  ) : undefined
                }
                onActivate={() => nav(`${tr.shared ? '/voyage/partage' : '/voyage'}/${tr.id}?vue=itineraire`)}
              />
            ))
          )
        ) : lit ? (
          // ── The lens roll-up ──────────────────────────────────────────────────────
          // One kind, the whole month, gathered date by date: a calendar-style date badge
          // on the left (the meal plan's own pattern) with that day's rows beside it. The
          // badge is the way back — tapping it drops the lens and opens that single day.
          lensDays.length === 0 ? (
            <EmptyState>{t.monthView.lensEmpty}</EmptyState>
          ) : (
            lensDays.map((d) => (
              <div key={d} className="monthv__rollup">
                <button
                  type="button"
                  className={'monthv__rollup-date' + (d === todayDay ? ' is-today' : '')}
                  onClick={() => pickDay(d)}
                  aria-label={cap(formatDayLong(d, lang))}
                >
                  <span className="monthv__rollup-dow mono" aria-hidden="true">{cap(weekdayShort(d, lang))}</span>
                  <span className="monthv__rollup-num" aria-hidden="true">{dayNum(d, lang)}</span>
                </button>
                <div className="monthv__rollup-rows">{dayRows(d, lit)}</div>
              </div>
            ))
          )
        ) : selCount === 0 ? (
          <EmptyState>{t.monthView.empty}</EmptyState>
        ) : (
          <>
            {dayTrips(selected)}
            {dayRows(selected, null)}
          </>
        )}
        {/* « L'auto » for the SELECTED day — its status + rides follow the picked date
            (today shows the live status; another date summarizes that day's windows).
            It sits at the FOOT of the panel, under the day's own things: the car is a
            standing background answer ("is it free?"), not one of the day's entries, and
            leading with it pushed the rendez-vous and meals you tapped the date FOR below
            the fold. Outside the loading/empty branch on purpose — a day with nothing
            planned still wants to say the car is free. */}
        {!lit && car && <AutoCardView model={car} day={selected} />}
        </div>
      </div>
      )}
      {eventActions.node}
    </div>
  )
}
