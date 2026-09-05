import { useCallback, useEffect, useMemo, useState } from 'react'
import { StaleBounce } from '../components/StaleBounce'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { isGuest } from '../lib/device'
import { useAuth } from '../lib/auth'
import { EntityShareModal } from '../components/EntityShareModal'
import { useLang, useT } from '../i18n'
import { live } from '../lib/query'
import { useProfile } from '../lib/profile'
import { useRecordUndo } from '../lib/toast'
import { formatDayLong, formatTime, capitalize } from '../lib/format'
import { addLocalDays, daysUntilLocal, todayLocalDay } from '../lib/localDay'
import { weatherIcon, weatherTint, weatherTip, type Weather, type DayOutlook } from '../lib/weather'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { PairPrompt } from '../components/Fallback'
import { Icon, InlineIcon } from '../components/Icon'
import { Cluster } from '../components/Layout'
import { SceneHead } from '../components/SceneHead'
import { SubTabs } from '../components/SubTabs'
import { useTabParam } from '../lib/tabParam'
import { Act } from '../components/board/Act'
import { SecLabel } from '../components/board/BoardCard'
import { SectionAdd, useSectionAdd } from '../components/SectionAdd'
import { CATS } from '../lib/cats'
import { eventMembers, memberFaces } from '../lib/eventPeople'
import { type Member } from '../components/board/types'
import { Fil } from '../components/board/Fil'
import { EditField } from '../components/EditField'
import { tripCategoryIcon, type TripCategory } from '../components/voyage/voyage'
import { TodoSection } from '../components/todos/TodoSection'
import { EventForm, type EventInit } from '../components/forms/EventForm'
import { ChoreForm, type ChoreInit } from '../components/forms/ChoreForm'
import { type Recipe, type RecipeTagsData, RECIPE_TAGS_KEY } from '../lib/recipes'
import { DEFAULT_PILLS } from '../lib/recipePills'
import { useLoves } from '../lib/loves'
import { useMealPrefs } from '../lib/mealPrefs'
import { useMeals, useRecipes, useDayNotes, usePantry, useLeftovers } from '../lib/queryHooks'
import { DayEditor } from '../components/kitchen/DayEditor'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { useAnnounceLeftover, usePlanLeftover } from '../components/kitchen/Leftovers'
import type { MealSlot } from '../lib/mealSlots'
import { reschedule, restoreMeals, planMealRecipe } from '../components/kitchen/mealMutations'
import {
  type Leftover,
  type MealsData,
  type DayNotesData,
  MEALS_KEY,
  MEAL_HISTORY_KEY,
  DAY_NOTES_KEY,
} from '../components/kitchen/types'
import { MONTH_KEY, BOARD_KEY, EVENTS_KEY, CHORES_KEY, WEATHER_KEY, CAR_KEY } from '../lib/queryKeys'

// Intl lowercases the French weekday ("lundi 14 juin"); the scene title wants it
// capitalized.

// The slice of /api/month this page needs: the day's events (one-off + expanded
// recurring) and recurring-chore occurrences. Meals/notes come from their own
// caches via DayEditor, so they're ignored here.
interface DayItemsData {
  events: { id: string; title: string; at: number; all_day: number; end_at?: number | null; car_id?: string | null; member_id: string | null; passengers?: string | null; contact_name?: string | null; business_name?: string | null; business_colour?: string | null; birthday?: boolean; age?: number | null; work?: boolean; end?: number; color?: string | null; notes?: string | null }[]
  chores: { id: string; title: string; color: string | null; who: string | null }[]
  // "Projets & Entretien" (home_projects) landing on this day — read-only here
  // (managed in Réglages ▸ Corvées). null homeProjects = older payload → [].
  homeProjects?: { id: string; kind: string; title: string; color: string | null }[]
  // « Voyage » bands overlapping this day — surfaces a "Voyage — Jour N" header that
  // taps into the trip's itinerary for this exact day. null trips = older payload → [].
  // `shared` = a « Voyage partagé » (promoted/joined): same header, tap deep-links to
  // /voyage/partage/:id instead of /voyage/:id.
  trips?: { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: boolean }[]
  // The DATED itinerary entries the operator wrote inside a trip, for THIS day — shown
  // under the trip header so the actual plans (not just "you're travelling") are here.
  // null = older payload → []. `media_kind`-only notes fall back to their category label.
  tripPlans?: { id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; colour: string }[]
}

// /kitchen/day/:date — one day's planner, as a full-screen .scene route (was the
// DayManageSheet bottom sheet). A height-capped sheet floats
// above the mobile keyboard, so its lower inputs (add a meal, the note) stranded
// under the keyboard; as a scene the page pins to the visible viewport and scrolls.
// This page OWNS the editing state + handlers (lifted off the
// Kitchen page, which is now a read-only glance); DayEditor renders them.
//
// The scene has TWO FACES behind one sub-tab row (`?vue=`, the Voyage pattern):
// « Journée » (default) — the day's agenda (rendez-vous, corvées, projets, à
// compléter, the Avant-de-partir door); « Repas » — the full meal planner
// (DayEditor). One day scene had grown both jobs stacked, and which one you came
// for depended on the door: a MEAL door (the kitchen grid's pencil, the ＋
// « Planifier un repas » picker, the history pencil, a meal search hit, the
// calendar ⋯ « Planifier un repas », a tapped MEAL's own peek — buildMeal's
// « Voir la journée », src/components/detail/adapters.ts, Marc 2026-09-04) lands
// `?vue=repas`; every DAY door (« Voir la journée » from a DAY panel/peek — not a
// meal's, « Planifier aujourd'hui/demain », the calendar cell) lands the
// default « Journée » (Marc, 2026-09-02). The SUB-TAB ROW IS THE FIRST THING in the
// body, and the weather strip + the day's note-headline live INSIDE « Journée »:
// they are context for the agenda, not for the meal planner, and above the picker
// they pushed the face choice down the screen (Marc, on review).
//
// No DetailProvider: nothing on this page peeks any more. A meal that carries a recipe
// navigates straight to that recipe's view, and MealRows already owns the per-row
// remove / move / rename / restants actions.
export function DayPlanPage() {
  const t = useT()
  const { lang } = useLang()
  // The day's hero meal (Réglages ▸ Repas) — it owns the grocery-staples step.
  const heroSlot = useMealPrefs().hero
  const qc = useQueryClient()
  const { memberId: profileId } = useProfile()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const close = useSceneClose('/kitchen')
  const nav = useNavigate()
  useEscapeKey(close)

  // Which face is showing — « Journée » (the agenda) or « Repas » (the meal
  // planner). URL-held (useTabParam) so a meal door can land `?vue=repas` and the
  // pick survives the return from a nested add/edit scene.
  const [vue, setVue] = useTabParam('vue', 'jour', ['jour', 'repas'] as const)
  // A one-shot "open this" param — consumed on arrival (see the effect below), unlike
  // `vue`, which is durable state the scene keeps.
  const [params, setParams] = useSearchParams()
  const focusParam = params.get('focus')
  const setFocusParam = useCallback(
    (v: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (v) next.set('focus', v)
          else next.delete('focus')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const { date: dateParam } = useParams()
  // A malformed :date (a stale link, an ISO string where day-seconds are expected)
  // must not CRASH the page. The « bad date → back to the grid » guard lives at the
  // bottom of this component, after the hooks — but the render above it already
  // called daysUntilLocal(NaN), which throws RangeError inside Intl and hit the
  // error boundary before the guard could ever run. Keep `bad` for the redirect and
  // feed the render a real day, so the guard is the thing that decides, not a throw.
  const parsed = Number(dateParam)
  const bad = !Number.isFinite(parsed)
  const date = bad ? todayLocalDay() : parsed

  // — server state (live-polled, same caches the Kitchen grid reads) —
  const meals = useMeals()
  // /api/meals' plain read is a ROLLING WINDOW from today (functions/api/meals.ts) —
  // it never carries a date already in the past, so a day scene reaching one (the
  // Historique pencil, the calendar's ⋯ « Planifier un repas ») would otherwise
  // render that day's meal planner EMPTY even though a meal is already there. This
  // is a second, narrow read for exactly that ONE day, only ever fetched when it's
  // actually past — merged into `days` below. Its key is a MEALS_KEY prefix, so
  // every existing meal write (they all already invalidate MEALS_KEY) refreshes it
  // too, same trick as MEAL_HISTORY_SUMMARY_KEY.
  const isPast = date < todayLocalDay()
  const pastMealsQ = useQuery({
    queryKey: [...MEALS_KEY, 'past', date],
    queryFn: () => api<MealsData>(`meals?date=${date}`),
    enabled: isPast,
    ...live,
  })
  const dayNotesQ = useDayNotes()
  const pantry = usePantry()
  const recipesQ = useRecipes()
  const leftoversQ = useLeftovers()
  // The household's recipe-pill config (a "Dîner & Souper" pill lifts its matching
  // recipes to the top of that slot's picker) + who loved what (a pill can test
  // "favorite"). Same cache RecipesTab/Réglages ▸ Recettes read — no extra fetch.
  const pillsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const { lovedSet } = useLoves()
  const boardQ = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: { text: string }[]; members?: Member[] }>('board'),
    ...live,
  })
  // This day's events + recurring-chore occurrences (the calendar's day page plans
  // these too, not just meals/notes). One narrow /api/month window for [date, +1d);
  // it already expands recurrence in local time. Keyed by the day so a return from
  // the add scenes (which invalidate ['month']) refetches.
  const dayItemsQ = useQuery({
    queryKey: [...MONTH_KEY, date],
    queryFn: () => api<DayItemsData>(`month?from=${date}&to=${addLocalDays(date, 1)}`),
    ...live,
  })
  const dayEvents = dayItemsQ.data?.events ?? []
  const dayChores = dayItemsQ.data?.chores ?? []
  const dayHome = dayItemsQ.data?.homeProjects ?? []
  const dayTrips = dayItemsQ.data?.trips ?? []
  const dayTripPlans = dayItemsQ.data?.tripPlans ?? []
  // Which day of the trip this is (1-based). Both dates are local-midnight; round
  // absorbs a DST ±1 h. Used for the "Voyage — Jour N" header.
  const tripDayNum = (startAt: number) => Math.round((date - startAt) / 86400) + 1
  // Full editable rows (recur_json, lead_seconds, rotation…) so a day row taps open
  // to its inline form pre-filled. The /api/month occurrence carries only display
  // fields; we resolve the series by its base id (recurring ids are `base#at`).
  const eventsFullQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventInit[] }>('events'), ...live })
  const choresFullQ = useQuery({ queryKey: CHORES_KEY, queryFn: () => api<{ chores: ChoreInit[] }>('chores'), ...live })
  const baseId = (id: string) => id.split('#')[0]
  const formMembers = boardQ.data?.members ?? []

  // Weather as day-planning context — the same slow 15-min poll the board reads
  // (shared cache key). The endpoint only knows today (current) and tomorrow
  // (high/low outlook), so the strip shows only when this day IS today or
  // tomorrow; any other planned day simply has no forecast to show.
  const wxQ = useQuery({
    queryKey: WEATHER_KEY,
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    staleTime: 15 * 60_000,
  })
  const dayOffset = daysUntilLocal(date) // 0 = today, 1 = tomorrow
  const todayWx = dayOffset === 0 ? wxQ.data?.weather ?? null : null
  const tomoWx = dayOffset === 1 ? wxQ.data?.tomorrow ?? null : null
  const todayTip = todayWx ? weatherTip(todayWx) : null

  // Calm "Bientôt" flag (migration 0038) — same predicate the board uses
  // (functions/_lib/reminder.isSoon): NOW sits in [at − lead, at). The /api/month
  // occurrences carry no lead, so resolve it off the full series we already load
  // for the edit forms, then quiet-chip the imminent rows. Never hides anything.
  const nowSec = Math.floor(Date.now() / 1000)
  const isSoonAt = (at: number, lead: number | null | undefined) => lead != null && nowSec >= at - lead && nowSec < at
  const eventSoon = (occId: string, at: number) =>
    isSoonAt(at, eventsFullQ.data?.events.find((e) => e.id === baseId(occId))?.lead_seconds)
  const choreSoon = (occId: string) => {
    const at = Number(occId.split('#')[1]) // recurring chore occurrence id is `base#at`
    return Number.isFinite(at) && isSoonAt(at, choresFullQ.data?.chores.find((c) => c.id === baseId(occId))?.lead_seconds)
  }

  // « À compléter »'s template picker waits behind that section's header ＋ (the shared
  // SectionAdd), like every other composer on this page — see the TodoSection call.
  const todoAdd = useSectionAdd()

  // Inline add (no value) / edit (value) for events + chores on this day. null = closed.
  const [eventForm, setEventForm] = useState<{ value?: EventInit } | null>(null)
  const [choreForm, setChoreForm] = useState<{ value?: ChoreInit } | null>(null)
  const openEventEdit = (occId: string) => {
    const full = eventsFullQ.data?.events.find((e) => e.id === baseId(occId))
    if (full) setEventForm({ value: full })
  }
  const openChoreEdit = (occId: string) => {
    const full = choresFullQ.data?.chores.find((c) => c.id === baseId(occId))
    if (full) setChoreForm({ value: full })
  }
  const afterEventSave = () => {
    setEventForm(null)
    qc.invalidateQueries({ queryKey: BOARD_KEY })
    qc.invalidateQueries({ queryKey: EVENTS_KEY })
    qc.invalidateQueries({ queryKey: MONTH_KEY })
    qc.invalidateQueries({ queryKey: CAR_KEY }) // the rendez-vous may take the car
  }
  const afterChoreSave = () => {
    setChoreForm(null)
    qc.invalidateQueries({ queryKey: BOARD_KEY })
    qc.invalidateQueries({ queryKey: CHORES_KEY })
    qc.invalidateQueries({ queryKey: MONTH_KEY })
  }

  const recipes = recipesQ.data?.recipes ?? []
  const days = isPast ? [...(meals.data?.days ?? []), ...(pastMealsQ.data?.days ?? [])] : (meals.data?.days ?? [])
  const mealsFor = (d: number, slot: string) => days.filter((m) => m.date === d && m.slot === slot)
  const noteFor = (d: number) => dayNotesQ.data?.notes?.find((n) => n.date === d)
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const recipeForMeal = useRecipeForMeal(recipes)
  const memberName = (id: string | null | undefined) =>
    (id && boardQ.data?.members?.find((m) => m.id === id)?.display_name) || ''
  // « Qui » faces for an event row — only when SEVERAL people share it (solo keeps its
  // plain name; the edit sheet / peek lists everyone).
  const eventFaces = (e: DayItemsData['events'][number]) => {
    const f = memberFaces(eventMembers(e), boardQ.data?.members ?? [])
    return f.length > 1 ? f : undefined
  }

  // — the souper planning flow (type a title → save) —
  const { editDate, setEditDate, mealText, setMealText, mealErr, beginSetMeal } = useMealPlanning(profileId)

  // — the lighter side slots' inline title editor —
  const [editSlot, setEditSlot] = useState<{ date: number; slot: string } | null>(null)
  const [slotText, setSlotText] = useState('')
  async function saveSlot(d: number, slot: string, title: string, recipeId?: string | null) {
    const v = title.trim()
    if (!v) {
      setEditSlot(null)
      setSlotText('')
      return
    }
    try {
      await write('meals', { method: 'POST', body: { date: d, slot, title: v, recipeId }, affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY] })
      // Only close the editor once the write lands (offline: queued) — a real
      // failure keeps the typed title so it can be retried (like the grocery bar).
      setEditSlot(null)
      setSlotText('')
    } catch {
      /* keep the editor open with the text intact */
    }
  }

  // — the day's free-text memo —
  const [editNote, setEditNote] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  async function saveNote(d: number, text: string) {
    const v = text.trim()
    if (!v) {
      setEditNote(null)
      setNoteText('')
      return
    }
    try {
      // BOARD too: /api/board carries today's day note, so a DAY_NOTES-only
      // invalidate left the wall showing the old memo until poll (the clear's
      // undo below already had the right list — the drift proved itself).
      await write('day-notes', { method: 'POST', body: { date: d, text: v }, affectedKeys: [DAY_NOTES_KEY, BOARD_KEY] })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open with the text intact */
    }
  }
  async function clearNote(d: number) {
    const note = qc.getQueryData<DayNotesData>(DAY_NOTES_KEY)?.notes.find((n) => n.date === d)
    try {
      await write('day-notes', { method: 'DELETE', body: { date: d }, affectedKeys: [DAY_NOTES_KEY, BOARD_KEY] })
      setEditNote(null)
      setNoteText('')
      if (note)
        recordUndo({
          message: t.undo.dayNoteCleared,
          onUndo: () =>
            void write('day-notes', {
              method: 'POST',
              body: { date: note.date, text: note.text },
              affectedKeys: [DAY_NOTES_KEY, BOARD_KEY],
            }).catch(() => {}),
        })
    } catch {
      /* keep the editor open so the clear can be retried */
    }
  }

  // Wipe a planned slot entirely (the ✕ beside the picker). The editor closes and
  // the day goes back to its open "＋" state. On failure the editor stays open.
  async function clearMeal(id: string) {
    // `days` (not a fresh MEALS_KEY read): the meal may live in the past-day query
    // instead, which a plain MEALS_KEY lookup would miss entirely.
    const meal = days.find((m) => m.id === id)
    try {
      await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY] })
      setEditDate(null)
      setMealText('')
      setEditSlot(null)
      setSlotText('')
      if (meal) recordUndo({ message: t.undo.mealRemoved(meal.title), onUndo: () => restoreMeals(qc, [meal]) })
    } catch {
      /* keep the editor open so the clear can be retried */
    }
  }

  // Reorder one meal within its slot (↑/↓). The server renumbers the slot.
  async function moveMeal(id: string, dir: 'up' | 'down') {
    await write('meals', { method: 'POST', body: { action: 'move', id, dir }, affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY] }).catch(() => {})
  }
  // Rename one meal in place (✏️) — keeps its slot/position/recipe link. Optimistic;
  // the board re-reads too (today's supper headline shows there).
  async function renameMeal(id: string, title: string) {
    const v = title.trim()
    if (!v) return
    await write('meals', {
      method: 'PATCH',
      body: { id, title: v },
      affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
      optimistic: (c) => {
        const patch = (d: MealsData | undefined) =>
          d ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, title: v } : m)) } : d
        c.setQueryData<MealsData>(MEALS_KEY, patch)
        // The meal may live in the past-day query instead of the window (see `isPast`).
        if (isPast) c.setQueryData<MealsData>([...MEALS_KEY, 'past', date], patch)
      },
    }).catch(() => {})
  }

  // "Il en reste ?" from a meal row — announce leftovers into the Restants pool,
  // through the ONE shared hook (components/kitchen/Leftovers).
  const announceLeftover = useAnnounceLeftover()

  // Easy clearing: wipe one slot's meals, or the whole day's. Snapshot the rows
  // first so Annuler can put them back (compensating undo).
  async function clearSlotMeals(d: number, slot: string) {
    const removed = days.filter((m) => m.date === d && m.slot === slot)
    await write('meals', { method: 'POST', body: { action: 'clear', date: d, slot }, affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY] }).catch(
      () => {},
    )
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(qc, removed) })
  }
  // Clearing the whole day empties the editor — leave the scene back to the grid.
  async function clearDay(d: number) {
    const removed = days.filter((m) => m.date === d)
    await write('meals', { method: 'POST', body: { action: 'clear', date: d }, affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY] }).catch(() => {})
    if (removed.length) recordUndo({ message: t.undo.dayCleared, onUndo: () => restoreMeals(qc, removed) })
    close()
  }

  // Plan a recipe onto any slot — a clean quick-add (links the recipe, saves now).
  async function planRecipe(d: number, slot: string, r: Recipe) {
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    await planMealRecipe(qc, d, slot, r)
  }

  // Plan a pooled leftover onto a day — the ONE shared implementation
  // (usePlanLeftover, Leftovers.tsx). This page carried a hand-rolled copy until
  // 2026-09-03, and it drifted exactly as that file's header warns: the fork's
  // key list was missing MEAL_HISTORY_KEY, so planning a leftover from the day
  // scene left Historique stale until the next poll.
  const planLeftover = usePlanLeftover()
  // The leftover-pick path: close whichever add-editor was open, then plan.
  function planLeftoverOnDay(d: number, slot: string, l: Leftover) {
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    void planLeftover(l, d, slot as MealSlot)
  }

  // Drag a meal to another slot (same day) — shares the grid's reschedule helper.
  const rescheduleMeal = (id: string, toDate: number, slot?: string) => void reschedule(qc, id, toDate, slot)

  // ?focus= — LAND ON THE THING, not merely on the page that contains it.
  //
  // « Note du jour » in the calendar's ⋯ menu navigated here and stopped: the composer
  // was right there, closed, so asking for the note cost a second tap to find it. A
  // door should open onto its target ready to act. Same grammar as Réglages'
  // `?focus=` (pages/Operator.tsx): act on it, then CONSUME the param with one
  // functional setParams, so a refresh or a back-nav doesn't reopen the composer.
  //
  //   ?focus=note  the day's note composer, seeded with whatever is already written
  //   ?focus=meal  the hero slot's meal composer (paired with ?vue=repas)
  //
  // Waits for the notes query so the composer opens with the existing text rather than
  // blanking it — the note arrives a beat after the page does.
  const focus = focusParam
  useEffect(() => {
    if (!focus || isGuest()) return
    if (focus === 'note') {
      if (dayNotesQ.data === undefined) return // not loaded yet — try again next render
      setEditNote(date)
      setNoteText(noteFor(date)?.text ?? '')
    } else if (focus === 'meal') {
      // The HERO slot has its own composer state (editDate/mealText) — the side slots
      // share editSlot/slotText. « Planifier un repas » means the headline meal, so it
      // opens the hero's.
      setEditDate(date)
      setMealText('')
    }
    setFocusParam(null)
  }, [focus, date, dayNotesQ.data, noteFor, setFocusParam])

  // A bad date in the URL → back to the grid rather than an empty editor.
  if (bad) return <StaleBounce to="/kitchen" message={t.kitchen.dayGone} />
  if (isUnauthorized(meals.error)) return <PairPrompt />

  // Read-only guest: DayEditor already gates its own controls; here the day-agenda
  // section's row-taps open edit forms and the ＋ buttons add — hide all of that, so
  // the events/chores read as plain Act cards.
  const ro = isGuest()
  // « Partager » a single event as a public /partage link (operator-only — a server write).
  const { signedIn } = useAuth()
  const [sharingEvent, setSharingEvent] = useState<{ id: string; title: string } | null>(null)
  const suppers = mealsFor(date, heroSlot)
  const dayNote = noteFor(date)
  const title = capitalize(formatDayLong(date, lang))

  // « Le fil du jour » — the day read as a SHAPE (a soft time axis + a « maintenant »
  // marker), reusing the board's ribbon. Same threshold as the board: only when the
  // day has ≥2 timed things is a timeline worth drawing. Timed = an event with a clock
  // (work windows included via `until`); all-day/birthday rows aren't on the ribbon.
  const filTimed = dayEvents.filter((e) => !e.all_day && !e.birthday)
  const filShown = filTimed.length >= 2
  // One event row, shared by the ribbon (its `node`) and the Rendez-vous bucket, so
  // both render identically. The « Partager » affordance stays a bucket-only control.
  const eventActNode = (e: DayItemsData['events'][number]) => (
    <Act
      cat={e.work ? 'work' : e.birthday ? 'birthday' : 'event'}
      title={e.work ? e.title || t.auto.work : e.title}
      when={
        e.work
          ? t.auto.range(formatTime(e.at, lang), e.end != null ? formatTime(e.end, lang) : '')
          : e.birthday
            ? e.age != null
              ? t.cercle.turnsN(e.age)
              : t.board.birthday
            : e.all_day
              ? t.board.allDay
              : formatTime(e.at, lang)
      }
      who={e.work ? memberName(e.member_id) || undefined : e.business_name ?? e.contact_name ?? memberName(e.member_id) ?? undefined}
      whoFaces={e.work ? undefined : eventFaces(e)}
      color={e.work ? e.color ?? undefined : e.business_colour ?? undefined}
      // 🚗 when this rendez-vous takes the shared car. A work window already gets
      // its own glyph via `cat="work"`; this gives the same cue to a rendez-vous
      // that ties up the vehicle, so the day page reads like the board.
      icon={!e.work && e.car_id ? 'car-bold' : undefined}
      soon={e.birthday || e.work ? undefined : eventSoon(e.id, e.at)}
      // Its own note (migration 0121) — « apporter la carte d'assurance maladie ».
      // A derived birthday/work window has none by construction.
      note={e.work || e.birthday ? undefined : e.notes?.trim() || undefined}
      onActivate={e.work ? () => nav('/voiture') : ro || e.birthday ? undefined : () => openEventEdit(e.id)}
    />
  )
  // When the ribbon is on it OWNS the timed events (board's "steal" idiom) — the
  // Rendez-vous bucket then lists only the all-day/birthday rows + the add button.
  const bucketEvents = filShown ? dayEvents.filter((e) => e.all_day || e.birthday) : dayEvents

  return (
    <div className="scene" aria-label={title}>
      <SceneHead title={title} card="board" onClose={close} closeLabel={t.common.close} />
      <div className="scene__body">

        {/* « Journée » | « Repas » — the scene's two faces. The day's agenda and its
            meal planner had grown into one long stack; one job at a time now, with
            the door deciding the landing (?vue=repas from the meal doors). */}
        <SubTabs
          options={[
            { key: 'jour', label: t.kitchen.dayVues.jour, icon: 'calendar-blank-bold' },
            { key: 'repas', label: t.kitchen.dayVues.repas, icon: CATS.meal.icon },
          ]}
          value={vue}
          onSelect={setVue}
          ariaLabel={title}
        />


        {vue === 'jour' && (
          <>
        {/* Day weather — only today/tomorrow have a forecast (see wxQ). A calm
            glance of "what's it like out" while planning this day's meals/events. */}
        {(todayWx || tomoWx) && (
          <div className="day-plan__wx">
            {todayWx && (
              <span className="tomorrow-wx mono" aria-label={`${t.weather[todayWx.bucket]} ${todayWx.tempC}°`}>
                <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                  <Icon name={weatherIcon(todayWx)} size={17} color={weatherTint(todayWx)} />
                </span>{' '}
                {todayWx.tempC}° · {t.weather[todayWx.bucket]}
                {todayTip ? ` · ${t.weather.tip[todayTip]}` : ''}
              </span>
            )}
            {tomoWx && (
              <span className="tomorrow-wx mono" aria-label={`${t.weather[tomoWx.bucket]} ${tomoWx.highC}° / ${tomoWx.lowC}°`}>
                <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                  <Icon
                    name={weatherIcon({ bucket: tomoWx.bucket, isDay: true, tempC: tomoWx.highC })}
                    size={17}
                    color={weatherTint({ bucket: tomoWx.bucket, isDay: true, tempC: tomoWx.highC })}
                  />
                </span>{' '}
                {tomoWx.highC}° / {tomoWx.lowC}°
              </span>
            )}
          </div>
        )}

        {/* The day's free-text note as its HEADLINE — "what's today about", pulled up
            under the date so the day itself leads (it used to sit under the meals).
            The page owns this state; DayEditor hides its own note copy (hideNote). */}
        <div className="day-plan__note">
          {ro ? (
            // Guest: the note reads as plain text (or nothing) — no edit affordance.
            dayNote ? (
              <span className="kitchen__note-chip" aria-disabled="true">
                <span aria-hidden="true"><Icon name="pencil-simple-bold" size={16} /></span>
                <span className="kitchen__note-text">{dayNote.text}</span>
              </span>
            ) : null
          ) : editNote === date ? (
            <EditField
              value={noteText}
              onChange={setNoteText}
              onSubmit={(v) => saveNote(date, v)}
              submitLabel={t.kitchen.setMeal}
              autoFocus
              placeholder={t.kitchen.notePlaceholder}
              ariaLabel={t.kitchen.note}
            >
              {dayNote && (
                <button
                  type="button"
                  className="btn btn--ghost mono kitchen__clear-meal"
                  onClick={() => clearNote(date)}
                >
                  <InlineIcon name="trash-bold" /> {t.kitchen.clearNote}
                </button>
              )}
            </EditField>
          ) : dayNote ? (
            <button
              type="button"
              className="kitchen__note-chip"
              onClick={() => {
                setEditNote(date)
                setNoteText(dayNote.text)
              }}
            >
              <span aria-hidden="true"><Icon name="pencil-simple-bold" size={16} /></span>
              <span className="kitchen__note-text">{dayNote.text}</span>
            </button>
          ) : (
            <button
              type="button"
              className="kitchen__note-add mono"
              onClick={() => {
                setEditNote(date)
                setNoteText('')
              }}
            >
              <InlineIcon name="plus-bold" /> {t.kitchen.note}
            </button>
          )}
        </div>
        {/* « Voyage » — this day sits inside a trip. A calm header that taps into the
            trip's itinerary for this exact day, followed by the actual plans entered
            for the day (the dated itinerary notes), so the right info is right here. */}
        {dayTrips.map((tr) => {
          const jour = tripDayNum(tr.start_at)
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
                // « Partagé » — a quiet icon marker (no loud pill), calm + subtle.
                badge={
                  tr.shared ? (
                    <span className="act__sharedmark" title={t.sharedVoyage.badge} aria-label={t.sharedVoyage.badge}>
                      <Icon name="users-three-bold" size={13} />
                    </span>
                  ) : undefined
                }
                onActivate={() => nav(`${base}?vue=itineraire`)}
              />
              {dayTripPlans
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

        {/* The day's sections, in the order the day is actually PLANNED: what is
            already booked and can't move (Rendez-vous ▸ Corvées ▸ Projets), then what
            you decide around it (À compléter). It used to open on the todo
            list and the meal editor, with the day's own schedule scrolled off below
            them — you had to leave the page to remember what the day held (Marc,
            2026-08-26). Les repas is the « Repas » face now, one tab over.

            One anatomy for every section, so the page reads as one thing: a `SecLabel`
            header (category glyph, title, rule, quiet count) whose trailing ＋ is the
            shared `SectionAdd`, the rows, then the composer the ＋ opened — folded away
            again once something is written. That replaces four hand-rolled `.sec-label`
            divs and the two full-width « Ajouter un rendez-vous / une corvée » bars that
            camped under each list. Editing a recurring row still edits the whole
            series. */}
        <section className="day-plan__sections">
          {/* Rendez-vous — the day's schedule leads. When the day has ≥2 timed things,
              « Le fil du jour » draws it as a ribbon INSIDE this section (it owns the
              timed rows; the bucket keeps the all-day ones) rather than under a second
              heading of its own — one section, one header, one subject. */}
          <section className="day-plan__sec" style={{ '--sec-tint': CATS.event.color } as React.CSSProperties}>
            <SecLabel
              label={t.monthView.legendEvents}
              icon={CATS.event.icon}
              count={dayEvents.length}
              action={
                <SectionAdd
                  open={!!eventForm}
                  onToggle={() => setEventForm(eventForm ? null : {})}
                  label={t.operator.addEvent}
                  readOnly={ro}
                />
              }
            />
            {filShown && (
              <Fil
                timed={filTimed.map((e) => ({ id: e.id, start_at: e.at, until: e.work ? e.end : undefined, node: eventActNode(e) }))}
                untimed={[]}
                anytimeLabel={t.board.anytime}
                nowLabel={t.board.now}
                freeLabel={t.board.free}
                lang={lang}
              />
            )}
            {!filShown && dayEvents.length === 0 && !eventForm ? (
              <EmptyState tone="calm">{t.monthView.empty}</EmptyState>
            ) : (
              bucketEvents.map((e) => (
                <div key={e.id} className="day-plan__act-row">
                  {eventActNode(e)}
                  {/* « Partager » one event → a public /partage link (real page, not a text
                      paste). Operator-only + real events only (not a derived birthday or a
                      work/car row). */}
                  {!e.work && !e.birthday && signedIn && (
                    <button
                      type="button"
                      className="btn btn--ghost mono day-plan__act-share"
                      onClick={() => setSharingEvent({ id: e.id, title: e.title })}
                      aria-label={t.shareLink.action}
                      title={t.shareLink.action}
                    >
                      <Icon name="arrow-up-right-bold" size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
            {!ro && eventForm && (
              <EventForm
                key={eventForm.value?.id ?? 'new-event'}
                members={formMembers}
                value={eventForm.value}
                initialDate={eventForm.value ? undefined : date}
                onSaved={afterEventSave}
                onCancel={() => setEventForm(null)}
              />
            )}
          </section>

          {/* Corvées — whose turn it is on this day. */}
          <section className="day-plan__sec" style={{ '--sec-tint': CATS.chore.color } as React.CSSProperties}>
            <SecLabel
              label={t.board.chores}
              icon={CATS.chore.icon}
              count={dayChores.length}
              action={
                <SectionAdd
                  open={!!choreForm}
                  onToggle={() => setChoreForm(choreForm ? null : {})}
                  label={t.operator.addChore}
                  readOnly={ro}
                />
              }
            />
            {dayChores.length === 0 && !choreForm ? (
              <EmptyState tone="calm">{t.monthView.empty}</EmptyState>
            ) : (
              dayChores.map((c) => (
                <Act
                  key={c.id}
                  cat="chore"
                  title={c.title}
                  who={c.who || undefined}
                  color={c.color || undefined}
                  soon={choreSoon(c.id)}
                  onActivate={ro ? undefined : () => openChoreEdit(c.id)}
                />
              ))
            )}
            {!ro && choreForm && (
              <ChoreForm
                key={choreForm.value?.id ?? 'new-chore'}
                members={formMembers}
                value={choreForm.value}
                initialStart={choreForm.value ? undefined : date}
                onSaved={afterChoreSave}
                onCancel={() => setChoreForm(null)}
              />
            )}
          </section>

          {/* Projets & Entretien landing on this day — read-only (managed in
              Réglages ▸ Corvées); shown only when there's something, to keep the
              day page calm. No ＋: this is a mirror, not a home. */}
          {dayHome.length > 0 && (
            <section className="day-plan__sec" style={{ '--sec-tint': CATS.chore.color } as React.CSSProperties}>
              <SecLabel label={t.operator.home.subEntretien} icon="gear-six-bold" count={dayHome.length} />
              {dayHome.map((h) => (
                <Act key={h.id} cat="chore" title={h.title} color={h.color || undefined} />
              ))}
            </section>
          )}

          {/* À compléter for THIS day — per-day check-off todos (migration 0046), with
              inline edit, check-in-place and one-tap departure templates. Its picker
              waits behind the same header ＋ as the two sections above (it used to sit
              open under the list), and it carries the same glyph + tint, so the shared
              component reads as one of this page's sections rather than a guest. */}
          <TodoSection
            day={date}
            title={t.todos.title}
            members={formMembers}
            bento={false}
            icon="check-square-bold"
            tint={CATS.list.color}
            picker={todoAdd.open ? 'templates' : 'none'}
            addAutoFocus={todoAdd.autoFocus}
            onAdded={todoAdd.close}
            action={<SectionAdd open={todoAdd.open} onToggle={todoAdd.toggle} label={t.todos.addPlaceholder} readOnly={ro} />}
          />

          {/* « Avant de partir » — this day's calm "before you go" screen (its departure
              checklists, that day's schedule + corvées, the weather tip, L'auto). A DOOR,
              so it sits at the FOOT now (LEAN #5): it opened the page above the day's own
              content, and "let me check what to grab" is a thought you have after reading
              the day, not before. Hidden for a read-only guest — the checklist it opens
              onto writes. */}
          {!ro && (
            <Cluster className="day-plan__doors">
              <button
                type="button"
                className="btn btn--ghost mono day-plan__add"
                onClick={() => nav(`/board/departure?day=${date}`)}
              >
                <Icon name="key-bold" size={16} /> {t.departure.title}
              </button>
            </Cluster>
          )}
        </section>
          </>
        )}

        {vue === 'repas' && (
          <section className="day-plan__sections">
            {/* Les repas — the full meal planner (DayEditor). No « Les repas » SecLabel:
                the « Repas » pill above already names the face (LEAN — a heading that
                repeats the tab is chrome). The day's note is the shared headline above
                the tabs, so DayEditor hides its own copy. */}
            <section className="day-plan__sec" style={{ '--sec-tint': CATS.meal.color } as React.CSSProperties}>
              <DayEditor
                date={date}
                recipes={recipes}
                lowItems={lowItems}
                listItems={listItems}
                pills={pillsQ.data?.pills ?? DEFAULT_PILLS}
                loved={lovedSet}
                suppers={suppers}
                mealsFor={mealsFor}
                note={dayNote}
                recipeFor={recipeForMeal}
                memberName={memberName}
                onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
                mealErr={mealErr}
                plan={{ editDate, setEditDate, mealText, setMealText, beginSetMeal }}
                picker={{ planRecipe }}
                leftovers={{
                  pool: leftoversQ.data?.leftovers ?? [],
                  plan: planLeftoverOnDay,
                }}
                slotEdit={{ editSlot, setEditSlot, slotText, setSlotText, saveSlot }}
                noteEdit={{ editNote, setEditNote, noteText, setNoteText, saveNote, clearNote }}
                actions={{ clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover, rescheduleMeal }}
                hideNote
              />
            </section>
          </section>
        )}

        {sharingEvent && (
          <EntityShareModal
            open
            onClose={() => setSharingEvent(null)}
            title={`${t.shareLink.action} · ${sharingEvent.title}`}
            body={{ kind: 'event', eventId: sharingEvent.id }}
          />
        )}
      </div>
    </div>
  )
}
