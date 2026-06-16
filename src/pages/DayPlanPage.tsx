import { useMemo, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isUnauthorized } from '../lib/api'
import { useLang, useT } from '../i18n'
import { live } from '../lib/query'
import { useProfile } from '../lib/profile'
import { useRecordUndo } from '../lib/toast'
import { formatDayLong } from '../lib/format'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { PairPrompt } from '../components/Fallback'
import { Icon } from '../components/Icon'
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
      await api('meals', { method: 'POST', body: { date: d, slot, title: v, recipeId } })
      // Only close the editor once the write lands — a failed plan keeps the typed
      // title so it can be retried (same as the grocery add bar).
      setEditSlot(null)
      setSlotText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
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
      await api('day-notes', { method: 'POST', body: { date: d, text: v } })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
  }
  async function clearNote(d: number) {
    const note = qc.getQueryData<DayNotesData>(DAY_NOTES_KEY)?.notes.find((n) => n.date === d)
    try {
      await api('day-notes', { method: 'DELETE', body: { date: d } })
      setEditNote(null)
      setNoteText('')
      if (note)
        recordUndo({
          message: t.undo.dayNoteCleared,
          onUndo: async () => {
            await api('day-notes', { method: 'POST', body: { date: note.date, text: note.text } }).catch(() => {})
            qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
            qc.invalidateQueries({ queryKey: ['board'] })
          },
        })
    } catch {
      /* keep the editor open so the clear can be retried */
    }
    qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
  }

  // Wipe a planned slot entirely (the ✕ beside the picker). The editor closes and
  // the day goes back to its open "＋" state. On failure the editor stays open.
  async function clearMeal(id: string) {
    const meal = qc.getQueryData<MealsData>(MEALS_KEY)?.days.find((m) => m.id === id)
    try {
      await api('meals', { method: 'DELETE', body: { id } })
      setEditDate(null)
      setMealText('')
      setEditSlot(null)
      setSlotText('')
      if (meal) recordUndo({ message: t.undo.mealRemoved(meal.title), onUndo: () => restoreMeals(qc, [meal]) })
    } catch {
      /* keep the editor open so the clear can be retried */
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Reorder one meal within its slot (↑/↓). The server renumbers the slot.
  async function moveMeal(id: string, dir: 'up' | 'down') {
    await api('meals', { method: 'POST', body: { action: 'move', id, dir } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }
  // Rename one meal in place (✏️) — keeps its slot/position/recipe link. Optimistic;
  // the board re-reads too (today's supper headline shows there).
  async function renameMeal(id: string, title: string) {
    const v = title.trim()
    if (!v) return
    qc.setQueryData<MealsData>(MEALS_KEY, (d) =>
      d ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, title: v } : m)) } : d,
    )
    await api('meals', { method: 'PATCH', body: { id, title: v } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  // "Il en reste ?" from a meal row — announce leftovers into the Restants pool.
  // Compensating undo deletes the row we just created (the pool is live-polled).
  async function announceLeftover(meal: MealRow) {
    const res = await api<{ id?: string }>('meal-leftovers', {
      method: 'POST',
      body: { title: meal.title, recipeId: meal.recipe_id ?? null, sourceMealId: meal.id },
    }).catch(() => null)
    qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
    const id = res?.id
    recordUndo({
      message: t.undo.leftoverAdded(meal.title),
      onUndo: async () => {
        if (id) await api('meal-leftovers', { method: 'DELETE', body: { id } }).catch(() => {})
        qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
      },
    })
  }

  // Easy clearing: wipe one slot's meals, or the whole day's. Snapshot the rows
  // first so Annuler can put them back (compensating undo).
  async function clearSlotMeals(d: number, slot: string) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === d && m.slot === slot)
    await api('meals', { method: 'POST', body: { action: 'clear', date: d, slot } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(qc, removed) })
  }
  // Clearing the whole day empties the editor — leave the scene back to the grid.
  async function clearDay(d: number) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === d)
    await api('meals', { method: 'POST', body: { action: 'clear', date: d } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.dayCleared, onUndo: () => restoreMeals(qc, removed) })
    close()
  }

  // — the shared recipe / leftover pickers —
  const [recipePickFor, setRecipePickFor] = useState<{ date: number; slot: string } | null>(null)
  const [leftoverPickFor, setLeftoverPickFor] = useState<{ date: number; slot: string } | null>(null)
  const [pickWithStaples, setPickWithStaples] = useState(false)

  // Plan a recipe onto ANY slot. Souper keeps its optional "+ ingredients" staples
  // step; every other slot is a clean quick-add (links the recipe, saves now).
  async function planRecipe(d: number, slot: string, r: Recipe) {
    setRecipePickFor(null)
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    if (slot === 'supper' && pickWithStaples) {
      chooseRecipeForMeal(d, slot, r)
      return
    }
    await api('meals', { method: 'POST', body: { date: d, slot, title: r.title, recipeId: r.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Plan a pooled leftover onto a day → a real meal tagged is_leftover; the pool
  // row is consumed server-side. Compensating undo: delete the created meal AND
  // re-insert the pool row, fully reversing the plan.
  async function planLeftover(l: Leftover, d: number, slot: string) {
    const res = await api<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date: d, slot },
    }).catch(() => null)
    qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
    const mealId = res?.mealId
    recordUndo({
      message: t.undo.leftoverPlanned(l.title),
      onUndo: async () => {
        if (mealId) await api('meals', { method: 'DELETE', body: { id: mealId } }).catch(() => {})
        await api('meal-leftovers', {
          method: 'POST',
          body: { title: l.title, recipeId: l.recipe_id ?? null, sourceMealId: l.source_meal_id ?? null },
        }).catch(() => {})
        qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
        qc.invalidateQueries({ queryKey: MEALS_KEY })
        qc.invalidateQueries({ queryKey: ['board'] })
      },
    })
  }
  // The "Choisir un reste" path: close whichever add-editor was open, then plan.
  function planLeftoverOnDay(d: number, slot: string, l: Leftover) {
    setLeftoverPickFor(null)
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

  const suppers = mealsFor(date, 'supper')
  const title = capitalize(formatDayLong(date, lang))

  return (
    <div className="scene" aria-label={title}>
      <div className="scene__head">
        <h2 className="pm-sheet__title">{title}</h2>
        <button type="button" className="btn btn--ghost mono" onClick={close} aria-label={t.common.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>
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
          picker={{ recipePickFor, setRecipePickFor, pickWithStaples, setPickWithStaples, planRecipe }}
          leftovers={{
            pool: leftoversQ.data?.leftovers ?? [],
            pickFor: leftoverPickFor,
            setPickFor: setLeftoverPickFor,
            plan: planLeftoverOnDay,
          }}
          slotEdit={{ editSlot, setEditSlot, slotText, setSlotText, saveSlot }}
          noteEdit={{ editNote, setEditNote, noteText, setNoteText, saveNote, clearNote }}
          actions={{ clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover, rescheduleMeal }}
        />
      </div>
    </div>
  )
}
