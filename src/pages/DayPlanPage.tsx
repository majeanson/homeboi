import { useMemo, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
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
import { addLocalDays, daysUntilLocal } from '../lib/localDay'
import { weatherIcon, weatherTint, weatherTip, type Weather, type DayOutlook } from '../lib/weather'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { PairPrompt } from '../components/Fallback'
import { Icon } from '../components/Icon'
import { Chip } from '../components/Chip'
import { SceneHead } from '../components/SceneHead'
import { Act } from '../components/board/Act'
import { tripCategoryIcon, type TripCategory } from '../components/voyage/voyage'
import { DetailProvider, useEntityDetail } from '../components/detail/DetailProvider'
import { buildMeal } from '../components/detail/adapters'
import { isMealSlot } from '../lib/mealSlots'
import { TodoSection } from '../components/todos/TodoSection'
import { EventForm, type EventInit } from '../components/forms/EventForm'
import { ChoreForm, type ChoreInit } from '../components/forms/ChoreForm'
import { type Recipe } from '../lib/recipes'
import { useMeals, useRecipes, useDayNotes, usePantry, useLeftovers, useTagColors } from '../lib/queryHooks'
import { DayEditor } from '../components/kitchen/DayEditor'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeForMeal } from '../components/kitchen/mealLookup'
import { reschedule, restoreMeals } from '../components/kitchen/mealMutations'
import {
  type Leftover,
  type MealRow,
  type MealsData,
  type DayNotesData,
  MEALS_KEY,
  DAY_NOTES_KEY,
  LEFTOVERS_KEY,
} from '../components/kitchen/types'
import { MONTH_KEY, BOARD_KEY, EVENTS_KEY, CHORES_KEY, WEATHER_KEY } from '../lib/queryKeys'

// Intl lowercases the French weekday ("lundi 14 juin"); the scene title wants it
// capitalized.

// The slice of /api/month this page needs: the day's events (one-off + expanded
// recurring) and recurring-chore occurrences. Meals/notes come from their own
// caches via DayEditor, so they're ignored here.
interface DayItemsData {
  events: { id: string; title: string; at: number; all_day: number; member_id: string | null; contact_name?: string | null; business_name?: string | null; business_colour?: string | null; birthday?: boolean; age?: number | null; work?: boolean; end?: number; color?: string | null }[]
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

// /kitchen/day/:date — one day's full meal-planning editor, as a full-screen
// .scene route (was the DayManageSheet bottom sheet). A height-capped sheet floats
// above the mobile keyboard, so its lower inputs (add a meal, the note) stranded
// under the keyboard; as a scene the page pins to the visible viewport and scrolls.
// Reached two ways — the ＋ "Planifier un repas" day picker and the grid's pencil —
// both navigate here. This page OWNS the editing state + handlers (lifted off the
// Kitchen page, which is now a read-only glance); DayEditor renders them.
//
// Wrapped in its own DetailProvider (this scene lives OUTSIDE HubLayout, where the
// app's provider sits) so a meal's recipe glyph opens the SAME peek the board uses
// — photo + ingredient glance — instead of hard-navigating off the editor.
export function DayPlanPage() {
  return (
    <DetailProvider>
      <DayPlanInner />
    </DetailProvider>
  )
}

function DayPlanInner() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const { memberId: profileId } = useProfile()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const close = useSceneClose('/kitchen')
  const nav = useNavigate()
  useEscapeKey(close)
  // Tap a meal's recipe glyph → peek its recipe (photo + glance), same as the board.
  const detail = useEntityDetail()

  const { date: dateParam } = useParams()
  const date = Number(dateParam)

  // — server state (live-polled, same caches the Kitchen grid reads) —
  const meals = useMeals()
  const dayNotesQ = useDayNotes()
  const pantry = usePantry()
  const recipesQ = useRecipes()
  const leftoversQ = useLeftovers()
  const boardQ = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: { text: string }[]; members?: { id: string; display_name: string }[] }>('board'),
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
  }
  const afterChoreSave = () => {
    setChoreForm(null)
    qc.invalidateQueries({ queryKey: BOARD_KEY })
    qc.invalidateQueries({ queryKey: CHORES_KEY })
    qc.invalidateQueries({ queryKey: MONTH_KEY })
  }

  const recipes = recipesQ.data?.recipes ?? []
  const days = meals.data?.days ?? []
  const mealsFor = (d: number, slot: string) => days.filter((m) => m.date === d && m.slot === slot)
  const noteFor = (d: number) => dayNotesQ.data?.notes?.find((n) => n.date === d)
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const recipeForMeal = useRecipeForMeal(recipes)
  const tagColors = useTagColors()
  const memberName = (id: string | null | undefined) =>
    (id && boardQ.data?.members?.find((m) => m.id === id)?.display_name) || ''

  // — the souper planning flow (type a title → AI staples → save) —
  const ai = useAiWake()
  const {
    editDate,
    setEditDate,
    mealText,
    setMealText,
    staplesBusy,
    staplePrompt,
    mealErr,
    saveMeal,
    beginSetMeal,
    chooseRecipeForMeal,
    toggleStaple,
  } = useMealPlanning(ai, profileId)

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
      await write('meals', { method: 'POST', body: { date: d, slot, title: v, recipeId }, affectedKeys: [MEALS_KEY, BOARD_KEY] })
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
      await write('day-notes', { method: 'POST', body: { date: d, text: v }, affectedKeys: [DAY_NOTES_KEY] })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open with the text intact */
    }
  }
  async function clearNote(d: number) {
    const note = qc.getQueryData<DayNotesData>(DAY_NOTES_KEY)?.notes.find((n) => n.date === d)
    try {
      await write('day-notes', { method: 'DELETE', body: { date: d }, affectedKeys: [DAY_NOTES_KEY] })
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
    const meal = qc.getQueryData<MealsData>(MEALS_KEY)?.days.find((m) => m.id === id)
    try {
      await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [MEALS_KEY, BOARD_KEY] })
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
    await write('meals', { method: 'POST', body: { action: 'move', id, dir }, affectedKeys: [MEALS_KEY, BOARD_KEY] }).catch(() => {})
  }
  // Rename one meal in place (✏️) — keeps its slot/position/recipe link. Optimistic;
  // the board re-reads too (today's supper headline shows there).
  async function renameMeal(id: string, title: string) {
    const v = title.trim()
    if (!v) return
    await write('meals', {
      method: 'PATCH',
      body: { id, title: v },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
      optimistic: (c) =>
        c.setQueryData<MealsData>(MEALS_KEY, (d) =>
          d ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, title: v } : m)) } : d,
        ),
    }).catch(() => {})
  }

  // "Il en reste ?" from a meal row — announce leftovers into the Restants pool.
  // Compensating undo deletes the row we just created (the pool is live-polled).
  async function announceLeftover(meal: MealRow) {
    const res = await write<{ id?: string }>('meal-leftovers', {
      method: 'POST',
      body: { title: meal.title, recipeId: meal.recipe_id ?? null, sourceMealId: meal.id },
      affectedKeys: [LEFTOVERS_KEY],
    }).catch(() => null)
    const id = res && !res.queued ? res.data?.id : undefined
    recordUndo({
      message: t.undo.leftoverAdded(meal.title),
      onUndo: () => {
        if (id) void write('meal-leftovers', { method: 'DELETE', body: { id }, affectedKeys: [LEFTOVERS_KEY] }).catch(() => {})
      },
    })
  }

  // Easy clearing: wipe one slot's meals, or the whole day's. Snapshot the rows
  // first so Annuler can put them back (compensating undo).
  async function clearSlotMeals(d: number, slot: string) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === d && m.slot === slot)
    await write('meals', { method: 'POST', body: { action: 'clear', date: d, slot }, affectedKeys: [MEALS_KEY, BOARD_KEY] }).catch(
      () => {},
    )
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(qc, removed) })
  }
  // Clearing the whole day empties the editor — leave the scene back to the grid.
  async function clearDay(d: number) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === d)
    await write('meals', { method: 'POST', body: { action: 'clear', date: d }, affectedKeys: [MEALS_KEY, BOARD_KEY] }).catch(() => {})
    if (removed.length) recordUndo({ message: t.undo.dayCleared, onUndo: () => restoreMeals(qc, removed) })
    close()
  }

  // — the souper "+ ingredients" opt-in (the recipe/leftover dropdown is now the
  //   combobox's own; only this cross-pick toggle stays page state) —
  const [pickWithStaples, setPickWithStaples] = useState(false)

  // Plan a recipe onto ANY slot. Souper keeps its optional "+ ingredients" staples
  // step; every other slot is a clean quick-add (links the recipe, saves now).
  async function planRecipe(d: number, slot: string, r: Recipe) {
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    if (slot === 'supper' && pickWithStaples) {
      chooseRecipeForMeal(d, slot, r)
      return
    }
    await write('meals', {
      method: 'POST',
      body: { date: d, slot, title: r.title, recipeId: r.id },
      affectedKeys: [MEALS_KEY, BOARD_KEY],
    }).catch(() => {})
  }

  // Plan a pooled leftover onto a day → a real meal tagged is_leftover; the pool
  // row is consumed server-side. Compensating undo: delete the created meal AND
  // re-insert the pool row, fully reversing the plan.
  async function planLeftover(l: Leftover, d: number, slot: string) {
    const keys = [LEFTOVERS_KEY, MEALS_KEY, BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date: d, slot },
      affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
          affectedKeys: keys,
        }).catch(() => {})
      },
    })
  }
  // The leftover-pick path: close whichever add-editor was open, then plan.
  function planLeftoverOnDay(d: number, slot: string, l: Leftover) {
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    void planLeftover(l, d, slot)
  }

  // Drag a meal to another slot (same day) — shares the grid's reschedule helper.
  const rescheduleMeal = (id: string, toDate: number, slot?: string) => void reschedule(qc, id, toDate, slot)

  // A bad date in the URL → back to the grid rather than an empty editor.
  if (!Number.isFinite(date)) return <Navigate to="/kitchen" replace />
  if (isUnauthorized(meals.error)) return <PairPrompt />

  // Read-only guest: DayEditor already gates its own controls; here the day-agenda
  // section's row-taps open edit forms and the ＋ buttons add — hide all of that, so
  // the events/chores read as plain Act cards.
  const ro = isGuest()
  // « Partager » a single event as a public /partage link (operator-only — a server write).
  const { signedIn } = useAuth()
  const [sharingEvent, setSharingEvent] = useState<{ id: string; title: string } | null>(null)
  const suppers = mealsFor(date, 'supper')
  const title = capitalize(formatDayLong(date, lang))

  return (
    <div className="scene" aria-label={title}>
      <SceneHead title={title} card="board" onClose={close} closeLabel={t.common.close} />
      <div className="scene__body">
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
                // « Partagé » marker on the header (a text surface) — calm.
                badge={tr.shared ? <Chip icon="users-three-bold">{t.sharedVoyage.badge}</Chip> : undefined}
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

        <DayEditor
          date={date}
          recipes={recipes}
          lowItems={lowItems}
          listItems={listItems}
          suppers={suppers}
          mealsFor={mealsFor}
          note={noteFor(date)}
          recipeFor={recipeForMeal}
          memberName={memberName}
          onOpenRecipe={(r, m) =>
            detail.open(
              buildMeal(m, { t, lang, members: [], tagColors }, { recipe: r, slotLabel: isMealSlot(m.slot) ? t.kitchen.slots[m.slot] : undefined }),
            )
          }
          mealErr={mealErr}
          plan={{ editDate, setEditDate, mealText, setMealText, staplesBusy, staplePrompt, saveMeal, beginSetMeal, toggleStaple }}
          picker={{ pickWithStaples, setPickWithStaples, planRecipe }}
          leftovers={{
            pool: leftoversQ.data?.leftovers ?? [],
            plan: planLeftoverOnDay,
          }}
          slotEdit={{ editSlot, setEditSlot, slotText, setSlotText, saveSlot }}
          noteEdit={{ editNote, setEditNote, noteText, setNoteText, saveNote, clearNote }}
          actions={{ clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover, rescheduleMeal }}
        />

        {/* The day's agenda + chores — so the calendar's day page plans everything,
            not just meals. Add + edit are inline (the shared EventForm/ChoreForm,
            date pre-filled). Editing a recurring row edits the whole series. */}
        <section className="day-plan__sections">
          {/* À compléter for THIS day — per-day check-off todos (migration 0046),
              with inline add/edit, check-in-place and one-tap departure templates. */}
          <TodoSection day={date} title={t.todos.title} members={formMembers} bento={false} />

          <div className="sec-label">
            <b>{t.board.chores}</b>
            <span className="ln" />
          </div>
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
          {!ro &&
            (choreForm ? (
              <ChoreForm
                key={choreForm.value?.id ?? 'new-chore'}
                members={formMembers}
                value={choreForm.value}
                initialStart={choreForm.value ? undefined : date}
                onSaved={afterChoreSave}
                onCancel={() => setChoreForm(null)}
              />
            ) : (
              <button type="button" className="btn btn--ghost mono day-plan__add" onClick={() => setChoreForm({})}>
                <Icon name="plus-bold" size={16} /> {t.operator.addChore}
              </button>
            ))}

          <div className="sec-label">
            <b>{t.monthView.legendEvents}</b>
            <span className="ln" />
          </div>
          {dayEvents.length === 0 && !eventForm ? (
            <EmptyState tone="calm">{t.monthView.empty}</EmptyState>
          ) : (
            dayEvents.map((e) => (
              <div key={e.id} className="day-plan__act-row">
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
                  color={e.work ? e.color ?? undefined : e.business_colour ?? undefined}
                  soon={e.birthday || e.work ? undefined : eventSoon(e.id, e.at)}
                  onActivate={e.work ? () => nav('/voiture') : ro || e.birthday ? undefined : () => openEventEdit(e.id)}
                />
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
          {!ro &&
            (eventForm ? (
              <EventForm
                key={eventForm.value?.id ?? 'new-event'}
                members={formMembers}
                value={eventForm.value}
                initialDate={eventForm.value ? undefined : date}
                onSaved={afterEventSave}
                onCancel={() => setEventForm(null)}
              />
            ) : (
              <button type="button" className="btn btn--ghost mono day-plan__add" onClick={() => setEventForm({})}>
                <Icon name="plus-bold" size={16} /> {t.operator.addEvent}
              </button>
            ))}

          {/* Projets & Entretien landing on this day — read-only (managed in
              Réglages ▸ Corvées); shown only when there's something, to keep the
              day page calm. */}
          {dayHome.length > 0 && (
            <>
              <div className="sec-label">
                <b>{t.operator.home.subEntretien}</b>
                <span className="ln" />
              </div>
              {dayHome.map((h) => (
                <Act key={h.id} cat="chore" title={h.title} color={h.color || undefined} />
              ))}
            </>
          )}
        </section>
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
