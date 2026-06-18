import { useMemo, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { isGuest } from '../lib/device'
import { useLang, useT } from '../i18n'
import { live } from '../lib/query'
import { useProfile } from '../lib/profile'
import { useRecordUndo } from '../lib/toast'
import { formatDayLong, formatTime } from '../lib/format'
import { addLocalDays } from '../lib/localDay'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { PairPrompt } from '../components/Fallback'
import { Icon } from '../components/Icon'
import { SceneHead } from '../components/SceneHead'
import { Act } from '../components/board/Act'
import { TodoSection } from '../components/todos/TodoSection'
import { EventForm, type EventInit } from '../components/forms/EventForm'
import { ChoreForm, type ChoreInit } from '../components/forms/ChoreForm'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
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
  type PantryData,
  type LeftoversData,
  MEALS_KEY,
  DAY_NOTES_KEY,
  PANTRY_KEY,
  LEFTOVERS_KEY,
} from '../components/kitchen/types'

// Intl lowercases the French weekday ("lundi 14 juin"); the scene title wants it
// capitalized.
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// The slice of /api/month this page needs: the day's events (one-off + expanded
// recurring) and recurring-chore occurrences. Meals/notes come from their own
// caches via DayEditor, so they're ignored here.
interface DayItemsData {
  events: { id: string; title: string; at: number; all_day: number; member_id: string | null }[]
  chores: { id: string; title: string; color: string | null; who: string | null }[]
}

// /kitchen/day/:date — one day's full meal-planning editor, as a full-screen
// .scene route (was the DayManageSheet bottom sheet). A height-capped sheet floats
// above the mobile keyboard, so its lower inputs (add a meal, the note) stranded
// under the keyboard; as a scene the page pins to the visible viewport and scrolls.
// Reached two ways — the ＋ "Planifier un repas" day picker and the grid's pencil —
// both navigate here. This page OWNS the editing state + handlers (lifted off the
// Kitchen page, which is now a read-only glance); DayEditor renders them.
export function DayPlanPage() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const nav = useNavigate()
  const { memberId: profileId } = useProfile()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const close = useSceneClose('/kitchen')
  useEscapeKey(close)

  const { date: dateParam } = useParams()
  const date = Number(dateParam)

  // — server state (live-polled, same caches the Kitchen grid reads) —
  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
  const dayNotesQ = useQuery({ queryKey: DAY_NOTES_KEY, queryFn: () => api<DayNotesData>('day-notes'), ...live })
  const pantry = useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live })
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
  const leftoversQ = useQuery({ queryKey: LEFTOVERS_KEY, queryFn: () => api<LeftoversData>('meal-leftovers'), ...live })
  const boardQ = useQuery({
    queryKey: ['board'],
    queryFn: () => api<{ list: { text: string }[]; members?: { id: string; display_name: string }[] }>('board'),
    ...live,
  })
  // This day's events + recurring-chore occurrences (the calendar's day page plans
  // these too, not just meals/notes). One narrow /api/month window for [date, +1d);
  // it already expands recurrence in local time. Keyed by the day so a return from
  // the add scenes (which invalidate ['month']) refetches.
  const dayItemsQ = useQuery({
    queryKey: ['month', date],
    queryFn: () => api<DayItemsData>(`month?from=${date}&to=${addLocalDays(date, 1)}`),
    ...live,
  })
  const dayEvents = dayItemsQ.data?.events ?? []
  const dayChores = dayItemsQ.data?.chores ?? []
  // Full editable rows (recur_json, lead_seconds, rotation…) so a day row taps open
  // to its inline form pre-filled. The /api/month occurrence carries only display
  // fields; we resolve the series by its base id (recurring ids are `base#at`).
  const eventsFullQ = useQuery({ queryKey: ['events'], queryFn: () => api<{ events: EventInit[] }>('events'), ...live })
  const choresFullQ = useQuery({ queryKey: ['chores'], queryFn: () => api<{ chores: ChoreInit[] }>('chores'), ...live })
  const baseId = (id: string) => id.split('#')[0]
  const formMembers = boardQ.data?.members ?? []

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
    qc.invalidateQueries({ queryKey: ['board'] })
    qc.invalidateQueries({ queryKey: ['events'] })
    qc.invalidateQueries({ queryKey: ['month'] })
  }
  const afterChoreSave = () => {
    setChoreForm(null)
    qc.invalidateQueries({ queryKey: ['board'] })
    qc.invalidateQueries({ queryKey: ['chores'] })
    qc.invalidateQueries({ queryKey: ['month'] })
  }

  const recipes = recipesQ.data?.recipes ?? []
  const days = meals.data?.days ?? []
  const mealsFor = (d: number, slot: string) => days.filter((m) => m.date === d && m.slot === slot)
  const noteFor = (d: number) => dayNotesQ.data?.notes?.find((n) => n.date === d)
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const recipeForMeal = useRecipeForMeal(recipes)
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
      await write('meals', { method: 'POST', body: { date: d, slot, title: v, recipeId }, affectedKeys: [MEALS_KEY] })
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
              affectedKeys: [DAY_NOTES_KEY, ['board']],
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
      await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [MEALS_KEY] })
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
    await write('meals', { method: 'POST', body: { action: 'move', id, dir }, affectedKeys: [MEALS_KEY] }).catch(() => {})
  }
  // Rename one meal in place (✏️) — keeps its slot/position/recipe link. Optimistic;
  // the board re-reads too (today's supper headline shows there).
  async function renameMeal(id: string, title: string) {
    const v = title.trim()
    if (!v) return
    await write('meals', {
      method: 'PATCH',
      body: { id, title: v },
      affectedKeys: [MEALS_KEY, ['board']],
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
    await write('meals', { method: 'POST', body: { action: 'clear', date: d, slot }, affectedKeys: [MEALS_KEY] }).catch(
      () => {},
    )
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(qc, removed) })
  }
  // Clearing the whole day empties the editor — leave the scene back to the grid.
  async function clearDay(d: number) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === d)
    await write('meals', { method: 'POST', body: { action: 'clear', date: d }, affectedKeys: [MEALS_KEY] }).catch(() => {})
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
      affectedKeys: [MEALS_KEY],
    }).catch(() => {})
  }

  // Plan a pooled leftover onto a day → a real meal tagged is_leftover; the pool
  // row is consumed server-side. Compensating undo: delete the created meal AND
  // re-insert the pool row, fully reversing the plan.
  async function planLeftover(l: Leftover, d: number, slot: string) {
    const keys = [LEFTOVERS_KEY, MEALS_KEY, ['board']]
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
  const suppers = mealsFor(date, 'supper')
  const title = capitalize(formatDayLong(date, lang))

  return (
    <div className="scene" aria-label={title}>
      <SceneHead title={title} card="board" onClose={close} closeLabel={t.common.close} />
      <div className="scene__body">
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
          onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
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
          <div className="sec-label">
            <b>{t.monthView.legendEvents}</b>
            <span className="ln" />
          </div>
          {dayEvents.length === 0 && !eventForm ? (
            <p className="feed-empty feed-empty--calm">{t.monthView.empty}</p>
          ) : (
            dayEvents.map((e) => (
              <Act
                key={e.id}
                cat="event"
                title={e.title}
                when={e.all_day ? t.board.allDay : formatTime(e.at, lang)}
                who={memberName(e.member_id) || undefined}
                onActivate={ro ? undefined : () => openEventEdit(e.id)}
              />
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

          <div className="sec-label">
            <b>{t.board.chores}</b>
            <span className="ln" />
          </div>
          {dayChores.length === 0 && !choreForm ? (
            <p className="feed-empty feed-empty--calm">{t.monthView.empty}</p>
          ) : (
            dayChores.map((c) => (
              <Act
                key={c.id}
                cat="chore"
                title={c.title}
                who={c.who || undefined}
                color={c.color || undefined}
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

          {/* À compléter for THIS day — per-day check-off todos (migration 0046),
              with inline add/edit, check-in-place and one-tap departure templates. */}
          <TodoSection day={date} title={t.todos.title} members={formMembers} bento={false} />
        </section>
      </div>
    </div>
  )
}
