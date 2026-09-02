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
import { CATS } from '../../lib/cats'
import { formatTime, formatMonthYear, formatDay, formatDayLong, weekdayShort, dayNum, capitalize as cap } from '../../lib/format'
import { monthGrid, inMonth, stepMonthDay } from '../../lib/monthgrid'
import { localYMD, addLocalDays, localDayStart } from '../../lib/localDay'
import { SLOT_ICON_NAME, isMealSlot, slotLabel as slotLabelFor, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs, type MealPrefs } from '../../lib/mealPrefs'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { type Lang } from '../../i18n'
import { Icon } from '../Icon'
import { Cluster } from '../Layout'
import { ActionMenu, type ActionMenuItem } from '../ActionMenu'
import { Act } from './Act'
import { tripCategoryIcon, type TripCategory } from '../voyage/voyage'
import { AutoCardView } from './AutoCard'
import { DayNote } from './DayNote'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, buildChore, type DetailCtx } from '../detail/adapters'
import { eventMembers, memberFaces } from '../../lib/eventPeople'
import { useOpenMeal } from '../detail/useOpenMeal'
import { useEventPeekActions } from '../detail/EventPeekActions'
import { colorOf, nameOf, type Dict, type Member } from './types'

const DAY = 86400

// The /api/month payload: every dated thing, already bucketed onto a UTC `day`
// key by the server. Mirrors the families on the bento board so the calendar is a
// faithful "is it all here?" inventory — events, meals, recurring chores, notes.
interface MEvent { id: string; title: string; at: number; all_day: number; member_id: string | null; passengers?: string | null; contact_name?: string | null; contact_address?: string | null; business_name?: string | null; business_id?: string | null; business_colour?: string | null; business_address?: string | null; end_at?: number | null; car_id?: string | null; day: number; birthday?: boolean; age?: number | null; work?: boolean; end?: number; color?: string | null; holds_car?: number }
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
// pattern). A scheduled habit emits every due day; a week-quota one only the days it
// was actually done (no fictional scheduling). `done` = the intention was met, and it
// is the ONE thing the calendar reads: the grid keeps habits out of its dots entirely
// (linesFor's filter below) and the tapped-day panel names only the done ones. Marking,
// backfilling and editing all live in « Le point du jour », one tap away — which is why
// this view no longer touches the real habits (useHabits/useMarkHabit) at all.
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
// The same marker, plus what it SAYS once the cell has room for words — which is when
// it is the tapped day (see the grid below). `time` is the clock face for a timed event
// and nothing for anything all-day; `label` is the title as the day panel prints it.
interface Line extends Dot {
  time?: string
  label: string
}

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

// EVERY dated thing on a day, in the order the detail panel lists them (events first,
// by member colour, then meals, chores, home projects, todos, habits, notes).
//
// This is the ONE builder behind all three faces of a day — the cell's dots, the cell's
// named lines, and the count under the panel header — so a thing can never show as a dot
// but go missing from the words, or vice versa. The compact density simply ignores
// `time`/`label` and draws the shape; keep it that way rather than forking a second walk.
function linesFor(
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
              // All-day rows carry no clock — the label alone, as on the panel.
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
  // À compléter todos → a check icon tinted with the member colour (drawn like the
  // meal slot icons), so they read apart from the filled chore/event dots.
  for (const td of b.todos)
    out.push({ color: colorOf(members, td.member_id) ?? CATS.chore.color, kind: 'todo', label: td.title })
  // « Mes habitudes » — a ring, hollow until the day's intention was met. Its own
  // shape so a habit never reads as a chore you owe someone.
  for (const h of b.habits)
    out.push({ color: h.colour ?? CATS.routine.color, kind: 'habit', done: h.done, label: h.title })
  for (const n of b.notes) out.push({ color: CATS.list.color, kind: 'note', label: n.text })
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
  const selCount =
    (sel ? sel.events.length + selMeals.length + sel.chores.length + selTodos.length + sel.home.length + sel.notes.length : 0) +
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
        // « Planifier un repas » is a MEAL door → the day scene's Repas face; the
        // day note is the scene's shared headline, reachable on the default face.
        { icon: 'fork-knife-bold', label: t.kitchen.planMeal, onSelect: () => nav(`/kitchen/day/${selected}?vue=repas`) },
        { icon: 'pencil-simple-bold', label: t.kitchen.note, onSelect: () => nav(`/kitchen/day/${selected}`) },
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
                    <span className="act__sharedmark" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
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
          // Habits are deliberately NOT cell markers. A daily intention (« boire assez
          // d'eau ») paints a glyph on EVERY square, which is exactly the noise a month
          // glance must not have: the eye is looking for the days that DIFFER. They keep
          // their place in the day panel, where they're actionable — and the legend
          // never listed them here in the first place.
          const marks = linesFor(b, members, mealPrefs, t, lang).filter((l) => l.kind !== 'habit')
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
                  {shown.slice(0, 4).map((dot, i) =>
                    dot.kind === 'meal' && dot.slot ? (
                      // Meal → its slot icon, tinted with the slot colour (Réglages ▸ Repas).
                      <span key={i} className={'monthv__dot-icon' + mk(dot.kind)}>
                        <Icon name={SLOT_ICON_NAME[dot.slot]} size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'todo' ? (
                      // À compléter → a check icon tinted with the member colour.
                      <span key={i} className={'monthv__dot-icon' + mk(dot.kind)}>
                        <Icon name="check-bold" size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'birthday' ? (
                      // A derived birthday → a cake, tinted with the cercle rose.
                      <span key={i} className={'monthv__dot-icon' + mk(dot.kind)}>
                        <Icon name="cake-bold" size={12} color={dot.color} />
                      </span>
                    ) : dot.kind === 'work' ? (
                      // A derived « L'auto » work window → a clock, tinted by the member.
                      <span key={i} className={'monthv__dot-icon' + mk(dot.kind)}>
                        <Icon name="clock-bold" size={12} color={dot.color} />
                      </span>
                    ) : (
                      <span
                        key={i}
                        className={`monthv__dot monthv__dot--${dot.kind}` + mk(dot.kind)}
                        // A ring (note) is drawn from `color`; filled shapes from `background`.
                        style={dot.kind === 'note' ? { color: dot.color } : { background: dot.color }}
                      />
                    ),
                  )}
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
                    <span className="act__sharedmark" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
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
