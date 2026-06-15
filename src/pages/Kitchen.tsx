import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, InlineIcon } from '../components/Icon'
import { HelpDot } from '../components/HelpDot'
import { SectionIntro } from '../components/SectionIntro'
import { useLang, useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useProfile } from '../lib/profile'
import { useTabParam } from '../lib/tabParam'
import { api, isUnauthorized } from '../lib/api'
import { useRecordUndo } from '../lib/toast'
import { live } from '../lib/query'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../lib/dnd'
import { PairPrompt } from '../components/Fallback'
import { formatWeekday, formatDay, formatDayLong, weekdayShort, dayNum } from '../lib/format'
import { addLocalDays } from '../lib/localDay'
import { type Recipe, RECIPES_KEY } from '../lib/recipes'
import { KidKitchen } from '../components/kitchen/KidKitchen'
import { PantryTab } from '../components/kitchen/PantryTab'
import { ReserveSection } from '../components/kitchen/ReserveSection'
import { RecipesTab } from '../components/kitchen/RecipesTab'
import { useAiWake } from '../components/kitchen/useAiWake'
import { useMealPlanning } from '../components/kitchen/useMealPlanning'
import { useRecipeShop } from '../components/kitchen/useRecipeShop'
import { useMealSuggest } from '../components/kitchen/useMealSuggest'
import { type LowRow, type MealRow, type MealsData, type MealIdeasData, type Leftover, type LeftoversData, type DayNotesData, type PantryData, type ReserveData, type WeekDay, MEALS_KEY, DAY_NOTES_KEY, MEAL_IDEAS_KEY, LEFTOVERS_KEY, PANTRY_KEY, USE_SOON_KEY, RESERVE_KEY } from '../components/kitchen/types'
import { MealIdeas } from '../components/kitchen/MealIdeas'
import { Leftovers } from '../components/kitchen/Leftovers'
import { DayManageSheet } from '../components/kitchen/DayManageSheet'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../lib/mealSlots'
import { useMealPrefs } from '../lib/mealPrefs'
import { tintInk, faint, hairline } from '../lib/colors'
import { useKitchenActions, NO_KITCHEN_ACTIONS } from '../lib/kitchenActions'

// La cuisine. Parent kitchen is three jobs — plan the week / track the pantry /
// browse the book — one sub-tab at a time. The page owns the queries (one unauth
// gate for all), the week grid, and the layout; the FLOWS live as hooks beside
// the tab components in src/components/kitchen/* (useMealPlanning = type/pick a
// supper + the AI staples step, useRecipeShop = shop-the-week, useMealSuggest =
// supper ideas, useAiWake = the shared cold-start/AI-off truth).
// Intl lowercases the French weekday ("lundi 14 juin"); the sheet title wants it
// capitalized.
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function Kitchen() {
  const t = useT()
  const qc = useQueryClient()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { memberId: profileId } = useProfile()
  // Per-slot meal visibility (Réglages ▸ Repas) trims the week's side-summary
  // glance. The full per-slot editor (DayManageSheet) still shows every slot, so a
  // hidden slot can always be planned from a day's "Gérer".
  const mealPrefs = useMealPrefs()
  const nav = useNavigate()
  // Kitchen reads are live-polled, so a held (deferred) delete would be resurrected
  // mid-window by the poll. Instead these clears commit immediately and register a
  // COMPENSATING undo: the inverse re-creates the meal(s)/note from the snapshot we
  // grab before deleting. A new row id is fine — the plan looks restored.
  const recordUndo = useRecordUndo()
  // The lighter side slots (déjeuner / dîner / collation): a plain title, no
  // staples/recipe flow — that richness stays on the souper. {date,slot} being
  // edited, plus its text.
  const [editSlot, setEditSlot] = useState<{ date: number; slot: string } | null>(null)
  const [slotText, setSlotText] = useState('')
  async function saveSlot(date: number, slot: string, title: string, recipeId?: string | null) {
    const v = title.trim()
    if (!v) {
      setEditSlot(null)
      setSlotText('')
      return
    }
    try {
      await api('meals', { method: 'POST', body: { date, slot, title: v, recipeId } })
      // Only close the editor once the write lands — a failed plan keeps the
      // typed title so it can be retried (same as the grocery add bar).
      setEditSlot(null)
      setSlotText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Wipe a planned slot entirely (the ✕ beside the picker). The editor closes and
  // the day goes back to its open "＋" state. On failure the editor stays open so
  // the action can be retried — same posture as saveSlot/saveMeal.
  async function clearMeal(id: string) {
    const meal = qc.getQueryData<MealsData>(MEALS_KEY)?.days.find((m) => m.id === id)
    try {
      await api('meals', { method: 'DELETE', body: { id } })
      setEditDate(null)
      setMealText('')
      setEditSlot(null)
      setSlotText('')
      if (meal) recordUndo({ message: t.undo.mealRemoved(meal.title), onUndo: () => restoreMeals([meal]) })
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
  // Drag-to-move: drop a meal on another day (slot kept) or another slot (same
  // day). The server appends it to the tail of the target slot. `slot` omitted →
  // preserve the meal's current slot (a day→day drag). The board re-reads too
  // (today's supper headline lives there). Optimistic so the row jumps at once;
  // the invalidate reconciles the authoritative order/position.
  async function rescheduleMeal(id: string, toDate: number, slot?: string) {
    qc.setQueryData<MealsData>(MEALS_KEY, (d) =>
      d
        ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, date: toDate, slot: slot ?? m.slot } : m)) }
        : d,
    )
    await api('meals', { method: 'POST', body: { action: 'reschedule', id, toDate, slot } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
  }
  // Rename one meal in place (✏️) — keeps its slot/position/recipe link, unlike a
  // remove + re-add. Optimistic so the row updates at once; the board re-reads too
  // (today's supper headline shows there).
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
  // Re-create a set of removed meals from their snapshot (the undo inverse). Each
  // comes back as a fresh row in the same day+slot — order/id may differ, the plan
  // reads as restored. Refresh the board too (today's supper shows there).
  async function restoreMeals(meals: MealRow[]) {
    for (const m of meals) {
      await api('meals', {
        method: 'POST',
        body: { date: m.date, slot: m.slot, title: m.title, recipeId: m.recipe_id ?? null },
      }).catch(() => {})
    }
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    qc.invalidateQueries({ queryKey: ['board'] })
  }
  // "Il en reste ?" from a meal row — announce leftovers into the Restants pool
  // (undated → the "à finir bientôt" reminder). Compensating undo deletes the row
  // we just created (the pool is live-polled, so a held delete would resurrect it).
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

  // Plan a pooled leftover onto a day → a real meal tagged is_leftover; the pool
  // row is consumed server-side (you eat leftovers once). Shared by the Restants
  // pool's own picker (Leftovers) and the day editor's "Choisir un reste"
  // (DayManageSheet) so both entry points behave identically. Compensating undo
  // (the caches are live-polled): delete the created meal AND re-insert the pool
  // row, fully reversing the plan.
  async function planLeftover(l: Leftover, date: number, slot: string) {
    const res = await api<{ mealId?: string }>('meal-leftovers', {
      method: 'POST',
      body: { action: 'plan', id: l.id, date, slot },
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
  // The day editor's "Choisir un reste" path: close whichever add-editor was open
  // (mirrors planRecipe), then plan the leftover onto the chosen slot.
  function planLeftoverOnDay(date: number, slot: string, l: Leftover) {
    setLeftoverPickFor(null)
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    void planLeftover(l, date, slot)
  }

  // Easy clearing: wipe one slot's meals, or a whole day's. Snapshot the rows first
  // so Annuler can put them back (compensating undo — see recordUndo above).
  async function clearSlotMeals(date: number, slot: string) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter(
      (m) => m.date === date && m.slot === slot,
    )
    await api('meals', { method: 'POST', body: { action: 'clear', date, slot } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.slotCleared, onUndo: () => restoreMeals(removed) })
  }
  async function clearDay(date: number) {
    const removed = (qc.getQueryData<MealsData>(MEALS_KEY)?.days ?? []).filter((m) => m.date === date)
    await api('meals', { method: 'POST', body: { action: 'clear', date } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
    if (removed.length) recordUndo({ message: t.undo.dayCleared, onUndo: () => restoreMeals(removed) })
  }

  // A free-text memo per day (déjeuner-to-collation context that isn't a meal:
  // "souper chez mémé", "lunch froid — sortie"). One per day; editing replaces it.
  // {date} being edited, plus its text.
  const [editNote, setEditNote] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  async function saveNote(date: number, text: string) {
    const v = text.trim()
    if (!v) {
      setEditNote(null)
      setNoteText('')
      return
    }
    try {
      await api('day-notes', { method: 'POST', body: { date, text: v } })
      setEditNote(null)
      setNoteText('')
    } catch {
      /* keep the editor open with the text intact */
    }
    qc.invalidateQueries({ queryKey: DAY_NOTES_KEY })
  }
  async function clearNote(date: number) {
    const note = qc.getQueryData<DayNotesData>(DAY_NOTES_KEY)?.notes.find((n) => n.date === date)
    try {
      await api('day-notes', { method: 'DELETE', body: { date } })
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

  const meals = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), ...live })
  const dayNotesQ = useQuery({ queryKey: DAY_NOTES_KEY, queryFn: () => api<DayNotesData>('day-notes'), ...live })
  const pantry = useQuery({ queryKey: PANTRY_KEY, queryFn: () => api<PantryData>('pantry'), ...live })
  const useSoonQ = useQuery({ queryKey: USE_SOON_KEY, queryFn: () => api<{ soon: LowRow[] }>('use-soon'), ...live })
  const reserveQ = useQuery({ queryKey: RESERVE_KEY, queryFn: () => api<ReserveData>('reserve'), ...live })
  const recipesQ = useQuery({ queryKey: RECIPES_KEY, queryFn: () => api<{ recipes: Recipe[] }>('recipes'), ...live })
  const ideasQ = useQuery({ queryKey: MEAL_IDEAS_KEY, queryFn: () => api<MealIdeasData>('meal-ideas'), ...live })
  const leftoversQ = useQuery({ queryKey: LEFTOVERS_KEY, queryFn: () => api<LeftoversData>('meal-leftovers'), ...live })
  // Shares the ['board'] cache with the Board/Liste pages — read only for the
  // shopping list, used to rank recipes by "what you could cook now".
  const boardQ = useQuery({
    queryKey: ['board'],
    queryFn: () => api<{ list: { text: string }[]; members?: { id: string; display_name: string }[] }>('board'),
    ...live,
  })
  // member id → name, for "suggéré par X" on a kid-suggested supper.
  const memberName = (id: string | null | undefined) =>
    (id && boardQ.data?.members?.find((m) => m.id === id)?.display_name) || ''
  const recipes = recipesQ.data?.recipes ?? []
  // The recipe book is routes now (/kitchen/recipe/:id, …/edit, …/cook, …/new) —
  // openers navigate instead of toggling local overlay state.
  // Which slot's recipe picker is open ({date, slot}) — any slot can pick a
  // recipe now, not just the souper.
  const [recipePickFor, setRecipePickFor] = useState<{ date: number; slot: string } | null>(null)
  // Which slot's "Choisir un reste" picker is open ({date, slot}) — the leftover
  // counterpart to recipePickFor; only one of the two opens at a time per slot.
  const [leftoverPickFor, setLeftoverPickFor] = useState<{ date: number; slot: string } | null>(null)
  // Which day's "Gérer" sheet is open (its full planning controls live there now,
  // off the calm read-only week grid). One at a time — so the souper/recipe-picker
  // singletons can't fight across days.
  const [manageDate, setManageDate] = useState<number | null>(null)
  // The ＋ sheet's "Planifier un repas" hands us a day via ?manage=<date> (one
  // editor, two entry points): open that day's Gérer sheet and consume the param
  // so it fires once and a refresh/back doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const m = searchParams.get('manage')
    if (!m) return
    const d = Number(m)
    if (Number.isFinite(d)) setManageDate(d)
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.delete('manage')
        return n
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])
  // Quick-add is the default (tap a recipe → it's set, no staples). This toggle
  // opts a pick INTO the grocery flow ("ajouter les ingrédients aussi") for the
  // times you do want the staples chips — kept off so dropping a recipe is one tap.
  const [pickWithStaples, setPickWithStaples] = useState(false)
  // Parent kitchen sub-tab: one job at a time so the page isn't an endless scroll.
  // Held in the URL (?tab=) so it survives the return from a full-screen add/edit
  // scene — add a recipe from Recettes and you come back to Recettes. See tabParam.
  const [kitTab, setKitTab] = useTabParam('tab', 'meals', ['meals', 'pantry', 'recipes'] as const)
  // Match a planned supper to a saved recipe by (loose) title, so a day's meal can
  // open its recipe.
  const recipeByTitle = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.title.trim().toLowerCase(), r)
    return m
  }, [recipes])
  // Exact link: a planned meal's recipe_id → its recipe. Preferred over the loose
  // title match (survives renames/duplicates); title stays the fallback for plain
  // free-text meals and pre-link rows.
  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>()
    for (const r of recipes) m.set(r.id, r)
    return m
  }, [recipes])
  // The recipe a planned meal points at: its exact link first, else a title match.
  const recipeForMeal = (meal: MealRow): Recipe | undefined =>
    (meal.recipe_id ? recipeById.get(meal.recipe_id) : undefined) ??
    recipeByTitle.get(meal.title.trim().toLowerCase())
  const lowItems = useMemo(() => (pantry.data?.low ?? []).map((l) => l.item), [pantry.data])
  const listItems = useMemo(() => (boardQ.data?.list ?? []).map((i) => i.text), [boardQ.data])
  const soonItems = useMemo(() => (useSoonQ.data?.soon ?? []).map((s) => s.item), [useSoonQ.data])
  const unauth = isUnauthorized(meals.error) || isUnauthorized(pantry.error)
  const days = meals.data?.days ?? []
  const weekStart = meals.data?.weekStart ?? 0
  // 10-day countdown block, re-anchored each Tuesday; the count shrinks 10 → 4
  // across the week (see functions/api/meals.ts). 10 is the just-loaded fallback.
  const windowDays = meals.data?.windowDays ?? 10
  const low = pantry.data?.low ?? []
  const soon = useSoonQ.data?.soon ?? []

  // Build the countdown grid from weekStart (today) across the remaining days of
  // the 10-day block. The SOUPER is the day's primary meal (the headline, the
  // shop-the-week driver, the kid-suggestion target), so the grid + week shape
  // stay keyed on it; the other slots ride alongside.
  const week: WeekDay[] = Array.from({ length: windowDays }, (_, i) => {
    // Step by LOCAL calendar days, not fixed 86 400 s: meals are bucketed at local
    // midnight (functions/_lib/ids localDayStart), and a local day is 23 h/25 h
    // across a DST change — plain arithmetic would land those days at 23:00/01:00
    // and `days.find` would miss them, showing/saving meals a cell off twice a year.
    const date = addLocalDays(weekStart, i)
    const meal = days.find((d) => d.date === date && d.slot === 'supper')
    return { date, meal }
  })
  // date+slot → its planned meals, in order (a slot holds several now). Server
  // already orders by position; this just filters the flat list.
  const mealsFor = (date: number, slot: string) => days.filter((d) => d.date === date && d.slot === slot)
  // date → its day note (the per-day memo), if any.
  const noteFor = (date: number) => dayNotesQ.data?.notes?.find((n) => n.date === date)

  // Drag a day's souper to another day — the calm week-grid gesture. Each day cell
  // is a drop zone keyed by its date; the souper headline is the drag handle. A day
  // can hold several suppers, so moving the headline moves them ALL to the target
  // day (the intuitive "move this day's supper plan"). Touch-friendly, so it works
  // on the wall tablet, not just a mouse.
  const dayDnd = usePointerDnd({
    onDrop: (fromKey, toKey) => {
      const from = Number(fromKey)
      const to = Number(toKey)
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return
      for (const m of mealsFor(from, 'supper')) rescheduleMeal(m.id, to, 'supper')
    },
    canDrop: (fromKey, toKey) => fromKey !== toKey,
    // Press-and-hold to move a day's plan — a calm, deliberate gesture, not a flick.
    holdMs: DND_HOLD_MS,
  })

  // The flows (see components/kitchen/use*). Destructured to the same names the
  // JSX always used, so the markup below reads unchanged.
  const ai = useAiWake()
  const { aiWaking } = ai
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
    kidSuggest,
    toggleStaple,
  } = useMealPlanning(ai, profileId)
  const { shopPrompt, setShopPrompt, shopBusy, beginShopWeek, toggleShop, confirmShop, shoppableCount } =
    useRecipeShop(days, recipeForMeal, listItems)
  const suggest = useMealSuggest(recipes, ai, lowItems, listItems, soonItems)

  // The week's three actions (shop the week / AI ideas / ideas from the book) now
  // live inside the ＋ Add sheet, not as a floating rail. The sheet is rendered by
  // HubLayout (a sibling of this page), so register the live handlers + their
  // availability up to it. Only while the Repas tab is the parent view — that's
  // where each action's result (the shop chips / the suggestion card) appears.
  const { register: registerKitchen } = useKitchenActions()
  const kitchenActionsActive = kitTab === 'meals' && audience === 'parent'
  // Push the current week-action availability up to the shell's ＋ Add sheet.
  // IDEMPOTENT by design: it only ever registers the CURRENT state (active
  // handlers + flags, or cleared when inactive), and HubLayout bails when the flag
  // VALUES are unchanged — so re-running on an unstable dep is a harmless no-op.
  // It deliberately has NO per-run cleanup: a cleanup that flipped the flags to
  // all-false on every re-run (with the setup flipping them back) was TWO real
  // state changes per render, which ping-ponged HubLayout↔Kitchen into an infinite
  // re-render and froze the tree mid-navigation (you couldn't leave La cuisine).
  // Clearing on the way out is a separate, unmount-only effect below.
  useEffect(() => {
    registerKitchen(
      kitchenActionsActive
        ? {
            shop: beginShopWeek,
            ai: suggest.suggestAi,
            book: suggest.suggestFromRecipes,
            useup: suggest.suggestUseUp,
          }
        : null,
      kitchenActionsActive
        ? {
            active: true,
            canShop: shoppableCount > 0,
            canAiSuggest: !suggest.aiOff,
            aiBusy: suggest.aiBusy,
            hasRecipes: suggest.hasRecipes,
            canUseUp: suggest.hasUseUp,
          }
        : NO_KITCHEN_ACTIONS,
    )
  }, [
    kitchenActionsActive,
    shoppableCount,
    suggest.aiOff,
    suggest.aiBusy,
    suggest.hasRecipes,
    suggest.hasUseUp,
    beginShopWeek,
    suggest.suggestAi,
    suggest.suggestFromRecipes,
    suggest.suggestUseUp,
    registerKitchen,
  ])
  // Clear the shell's kitchen actions once, when La cuisine unmounts — so leaving
  // for another tab never leaves stale tiles in the ＋ sheet.
  useEffect(() => () => registerKitchen(null, NO_KITCHEN_ACTIONS), [registerKitchen])

  // Plan a recipe onto ANY slot (the shared picker's onPick). Souper keeps its
  // optional "+ ingredients" staples step; every other slot is a clean quick-add
  // (links the recipe, saves now). Closes whichever editor was open.
  async function planRecipe(date: number, slot: string, r: Recipe) {
    setRecipePickFor(null)
    setEditDate(null)
    setEditSlot(null)
    setMealText('')
    setSlotText('')
    if (slot === 'supper' && pickWithStaples) {
      chooseRecipeForMeal(date, slot, r)
      return
    }
    await api('meals', { method: 'POST', body: { date, slot, title: r.title, recipeId: r.id } }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
  }

  // Keep a suggestion (AI text, or a real recipe link) into the ideas pool.
  async function keepSuggestion() {
    if (!suggest.current) return
    await api('meal-ideas', {
      method: 'POST',
      body: { title: suggest.current.title, recipeId: suggest.current.recipe?.id ?? null, suggestedBy: profileId },
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEAL_IDEAS_KEY })
  }

  if (unauth) return <PairPrompt />

  if (audience === 'toddler') {
    return (
      <KidKitchen
        week={week}
        recipes={recipes}
        recipeFor={recipeForMeal}
        onSuggest={kidSuggest}
        // "Start its recipe": a planned meal a toddler taps opens Cook mode —
        // big one-step-at-a-time pages that read themselves aloud (its own route).
        onStartRecipe={(r) => nav(`/kitchen/recipe/${r.id}/cook`)}
      />
    )
  }

  return (
    <>
      <main className="kitchen today-feed">
        <div className="app-head">
          <div>
            <div className="hand-tag">{t.kitchen.plan}</div>
            <div className="app-head__titlerow">
              <h1 className="greet">{t.kitchen.title}</h1>
              <HelpDot card="kitchen" />
            </div>
          </div>
          <div className="avatar" style={{ background: 'var(--terracotta-wash)' }}>
            <Icon name="carrot-bold" size={26} color="var(--terracotta-deep)" />
          </div>
        </div>

        <SectionIntro card="kitchen" />

        <div className="subtabs" role="tablist" aria-label={t.kitchen.title}>
          {([
            ['meals', t.kitchen.tabMeals],
            ['pantry', t.kitchen.tabPantry],
            ['recipes', t.kitchen.tabRecipes],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={kitTab === key}
              className={'subtabs__opt' + (kitTab === key ? ' is-on' : '')}
              onClick={() => setKitTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {kitTab === 'meals' && (
        <section>
          <div className="kitchen__head">
            <h2>{t.kitchen.week}</h2>
          </div>

          {/* The week's three actions (shop the week / AI ideas / ideas from the
              book) moved INTO the ＋ Add sheet as icon tiles (see useKitchenActions
              above) — no more floating rail. Their results still surface here. */}
          {aiWaking && (
            <p className="kitchen__ai-waking mono" role="status">
              ⏳ {t.kitchen.aiWaking}
            </p>
          )}
          {mealErr && (
            <p className="error mono" role="alert">
              {t.common.saveFailed}
            </p>
          )}
          {suggest.current && (
            <div className="kitchen__suggestion" role="status">
              <span className="kitchen__suggestion-text">
                🍽 {suggest.current.title}
                {suggest.current.source === 'book' && (suggest.current.missing ?? 0) > 0 && (
                  <span className="mono kitchen__suggestion-sub"> · {t.recipes.missingN(suggest.current.missing!)}</span>
                )}
                {suggest.current.source === 'useup' && (suggest.current.uses ?? 0) > 0 && (
                  <span className="mono kitchen__suggestion-sub"> · {t.recipes.usesN(suggest.current.uses!)}</span>
                )}
              </span>
              <span className="kitchen__suggestion-actions">
                {/* Re-ask the SAME source right here — another idea without
                    re-opening the ＋ Add sheet. AI re-asks step through its batch
                    (1 call / 10), the recipe sources cycle their ranked list. */}
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  onClick={suggest.again}
                  disabled={suggest.current.source === 'ai' && (suggest.aiBusy || suggest.aiOff)}
                >
                  🔁 {t.kitchen.suggestMore}
                </button>
                {suggest.current.recipe && (
                  <button
                    type="button"
                    className="btn btn--ghost mono"
                    onClick={() => nav(`/kitchen/recipe/${suggest.current!.recipe!.id}`)}
                  >
                    {t.kitchen.suggestOpen}
                  </button>
                )}
                <button type="button" className="btn btn--ghost mono" onClick={keepSuggestion}>
                  ＋ {t.kitchen.suggestKeep}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost mono kitchen__suggestion-dismiss"
                  onClick={suggest.clear}
                  aria-label={t.common.close}
                >
                  <Icon name="x-bold" size={16} />
                </button>
              </span>
            </div>
          )}
          {shopPrompt && (
            <div className="kitchen__staples kitchen__shop">
              {shopPrompt.length === 0 ? (
                <p className="kitchen__staples-q mono">{t.kitchen.shopWeekEmpty}</p>
              ) : (
                <>
                  <p className="kitchen__staples-q mono">{t.kitchen.shopWeekQ}</p>
                  <p className="kitchen__staples-hint mono">{t.kitchen.shopWeekHint}</p>
                  <div className="kitchen__staples-chips">
                    {shopPrompt.map((o) => (
                      <button
                        key={o.item}
                        type="button"
                        className={`chip${o.on ? ' is-on' : ''}`}
                        onClick={() => toggleShop(o.item)}
                        aria-pressed={o.on}
                        title={o.item}
                      >
                        <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="kitchen__staples-actions">
                {shopPrompt.length > 0 && (
                  <button type="button" className="btn btn--primary mono" onClick={confirmShop} disabled={shopBusy}>
                    {t.kitchen.shopWeekAdd}
                  </button>
                )}
                <button type="button" className="btn btn--ghost mono" onClick={() => setShopPrompt(null)}>
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}
          <ul className="kitchen__week">
            {week.map(({ date }) => {
              const dow = new Date(date * 1000).getDay()
              const isToday = date === weekStart
              const isTomorrow = date === addLocalDays(weekStart, 1)
              // Concise relative tag ("Auj."/"Dem.") so the tiny date badge never
              // overflows with "Aujourd'hui"/"Demain".
              const rel = isToday ? t.kitchen.todayShort : isTomorrow ? t.kitchen.tomorrowShort : null
              const suppers = mealsFor(date, 'supper') // a day can hold several
              const showSupper = mealPrefs.isVisible('supper') && suppers.length > 0
              const supperColor = mealPrefs.color('supper')
              const note = noteFor(date)
              // The lighter slots as their own colour-coded chips (déjeuner / dîner /
              // collation), reusing the per-slot meal colours + icons (mealSlots +
              // Réglages ▸ Repas). Each visible slot with meals becomes one chip that
              // WRAPS at full card width — never clipped behind the Gérer cue, unlike
              // the old single ellipsized line. Hidden slots drop off. Full per-slot
              // editing still lives in the Gérer sheet.
              const sideRows = SIDE_SLOTS.filter((s) => mealPrefs.isVisible(s))
                .map((s) => ({ slot: s, titles: mealsFor(date, s).map((m) => m.title).join(', ') }))
                .filter((r) => r.titles)
              return (
              <li
                key={date}
                data-dnd-zone={String(date)}
                className={
                  'surface kitchen__day' +
                  (isToday ? ' is-today' : '') +
                  (dow === 0 || dow === 6 ? ' is-weekend' : '') +
                  (dayDnd.over === String(date) ? ' dnd-over' : '')
                }
              >
                {/* Calendar-style date badge — weekday + day number, the row's left
                    anchor. Today/tomorrow get a relative tag; today's whole card
                    lights up so "you are here" reads at a glance in the countdown. */}
                <span className="kitchen__day-date" aria-label={formatDay(date, lang)}>
                  {rel && <span className="kitchen__day-rel mono">{rel}</span>}
                  <span className="kitchen__day-dow mono" aria-hidden="true">{weekdayShort(date, lang)}</span>
                  <span className="kitchen__day-num" aria-hidden="true">{dayNum(date, lang)}</span>
                </span>
                {/* Calm, read-only glance — the souper headline, the other slots as
                    colour chips, the note. The meal info is plain display (no longer
                    a giant button that hid it behind an ellipsis); only the compact
                    "Gérer" cue opens that day's editor. Full editing lives in the
                    DayManageSheet so two days still fit a phone. */}
                <div className="kitchen__day-body">
                  <div className="kitchen__day-top">
                    <span
                      className={
                        'kitchen__day-sum-main' +
                        (showSupper ? ' kitchen__day-drag' : '') +
                        (showSupper && dayDnd.activeId === String(date) ? ' is-dragging' : '')
                      }
                      onPointerDown={
                        showSupper
                          ? (e) => dayDnd.start(String(date), suppers.map((m) => m.title).join(' · '), e)
                          : undefined
                      }
                      role={showSupper ? 'button' : undefined}
                      aria-label={showSupper ? t.kitchen.dragDay : undefined}
                      title={showSupper ? t.kitchen.dragDay : undefined}
                    >
                      {showSupper ? (
                        <>
                          {/* Grip + slot icon + title on ONE line; the Restants tag drops
                              to its own line below (the column is set in CSS) so it never
                              sits to the right of the title and eats its width. */}
                          <span className="kitchen__day-sum-line">
                            {/* A drag grip so the calm headline reads as "movable" — drag
                                it onto another day to reschedule the souper. */}
                            <span className="dnd-grip mono" aria-hidden="true">⠿</span>
                            {/* The souper slot icon in its slot colour — the same icon +
                                colour the chips and Réglages ▸ Repas use, not a bare dot. */}
                            <Icon name={SLOT_ICON_NAME.supper} size={18} color={supperColor} />
                            <span className="kitchen__day-sum-titles">{suppers.map((m) => m.title).join(' · ')}</span>
                          </span>
                          {/* Flag a leftover souper on the calm glance, so "finish the
                              fridge" reads without opening the day. Below the title. */}
                          {suppers.some((m) => m.is_leftover) && (
                            <span className="kitchen__meal-tag mono">
                              <InlineIcon name="arrow-counter-clockwise-bold" size={12} /> {t.kitchen.leftoversTag}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="kitchen__day-sum-empty mono">{t.kitchen.planShort}</span>
                      )}
                    </span>
                    {/* A small, icon-only edit button — the lone tap target that
                        opens the day's editor. No "Gérer" label: the pencil says it
                        and keeps the pill tiny so meal info keeps the width. */}
                    <button
                      type="button"
                      className="kitchen__day-manage"
                      onClick={() => setManageDate(date)}
                      aria-label={`${t.kitchen.manage} · ${formatDay(date, lang)}`}
                    >
                      <Icon name="pencil-simple-bold" size={16} />
                    </button>
                  </div>
                  {sideRows.length > 0 && (
                    <span className="kitchen__day-slots">
                      {sideRows.map(({ slot, titles }) => {
                        const c = mealPrefs.color(slot)!
                        return (
                          <span
                            key={slot}
                            className="meal-chip"
                            style={{ color: tintInk(c), background: faint(c), borderColor: hairline(c) }}
                          >
                            <InlineIcon name={SLOT_ICON_NAME[slot]} /> {titles}
                          </span>
                        )
                      })}
                    </span>
                  )}
                  {note && (
                    <span className="kitchen__day-sum-meta mono">
                      <InlineIcon name="pencil-simple-bold" /> {note.text}
                    </span>
                  )}
                </div>
              </li>
              )
            })}
          </ul>
          <DragGhost ghost={dayDnd.ghost} />

          {/* One day's full planning controls, opened from a row's "Gérer" button.
              State stays owned here (the souper flow + the recipe picker are page
              singletons); the sheet just renders them for the one open day. */}
          <DayManageSheet
            open={manageDate !== null}
            date={manageDate}
            title={manageDate !== null ? capitalize(formatDayLong(manageDate, lang)) : ''}
            onClose={() => setManageDate(null)}
            recipes={recipes}
            lowItems={lowItems}
            listItems={listItems}
            suppers={manageDate !== null ? mealsFor(manageDate, 'supper') : []}
            mealsFor={mealsFor}
            note={manageDate !== null ? noteFor(manageDate) : undefined}
            recipeFor={recipeForMeal}
            memberName={memberName}
            onOpenRecipe={(r) => nav(`/kitchen/recipe/${r.id}`)}
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

          <MealIdeas
            ideas={ideasQ.data?.ideas ?? []}
            recipes={recipes}
            week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
            lowItems={lowItems}
            listItems={listItems}
            profileId={profileId}
          />

          {/* Restants — leftovers to finish. Quick-pick from today's planned meals
              (those not already a leftover), or type one; tap to plan onto a day. */}
          <Leftovers
            leftovers={leftoversQ.data?.leftovers ?? []}
            recentMeals={days.filter((d) => d.date === weekStart && !d.is_leftover)}
            week={week.map((w) => ({ date: w.date, label: formatWeekday(w.date, lang) }))}
          />
        </section>
        )}

        {kitTab === 'pantry' && (
          <>
            <PantryTab low={low} soon={soon} />
            <ReserveSection reserve={reserveQ.data?.reserve ?? []} />
          </>
        )}

        {kitTab === 'recipes' && (
          <RecipesTab
            recipes={recipes}
            lowItems={lowItems}
            soonItems={soonItems}
            listItems={listItems}
            onView={(r) => nav(`/kitchen/recipe/${r.id}`)}
          />
        )}
      </main>
    </>
  )
}
