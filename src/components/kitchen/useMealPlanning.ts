import { useState } from 'react'
import { api, isStatus } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { ingredientName } from '../../lib/ingredient'
import { withoutHeadings } from '../../lib/recipeSections'
import { type Recipe } from '../../lib/recipes'
import { BOARD_KEY } from '../../lib/queryKeys'
import { MEALS_KEY, MEAL_IDEAS_KEY, MEAL_HISTORY_KEY } from './types'
import { type AiWake } from './useAiWake'

// The week-grid planning flow, extracted from the Kitchen page: type (or pick a
// recipe for) a day's supper, confirm its staples for the grocery list, persist.
// Pure state + handlers — the page renders; this decides.
export interface StaplePrompt {
  date: number
  slot: string // which slot the new meal is appended to (déjeuner/dîner/souper/collation)
  title: string
  recipeId?: string | null // carried through so the saved meal keeps its recipe link
  options: { item: string; on: boolean }[]
}

export function useMealPlanning(ai: AiWake, profileId: string | null) {
  const write = useWrite()
  const [editDate, setEditDate] = useState<number | null>(null)
  const [mealText, setMealText] = useState('')
  // The meal -> grocery staple step (B3): after a title is entered, we offer the
  // dish's staples as chips for the shared list. null = no prompt up.
  const [staplesBusy, setStaplesBusy] = useState(false)
  const [staplePrompt, setStaplePrompt] = useState<StaplePrompt | null>(null)
  const [mealErr, setMealErr] = useState(false)

  // Persist the supper, optionally pushing chosen staples onto the shared list
  // (the meals endpoint inserts them with source 'meal' in the same write).
  // On failure the edit/staple state stays put (the typed title isn't lost) and
  // an error line appears — silently closing would read as "saved" when nothing was.
  async function saveMeal(date: number, slot: string, title: string, staples: string[], recipeId?: string | null) {
    setMealErr(false)
    try {
      // Appends to the slot (a slot is a list now — see functions/api/meals.ts).
      // Offline this queues (resolves, no throw) and syncs on reconnect; a real
      // server rejection still throws → the error line shows, the title isn't lost.
      await write('meals', {
        method: 'POST',
        body: { date, slot, title, staples, recipeId },
        affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY],
      })
      setEditDate(null)
      setMealText('')
      setStaplePrompt(null)
    } catch {
      setMealErr(true)
    }
  }

  // Setting a meal optionally asks the router for its staples (B3). The staple step
  // is OPT-IN, governed by the same "+ ingrédients" toggle a recipe pick uses
  // (`withStaples`): default off → just save the meal, one less step. When it's on
  // and AI finds some, we show the confirm chips; if AI is off (503) or finds
  // nothing, we still just save — the staple step is a bonus, never a gate
  // (NFR-DEGRADE-1).
  async function beginSetMeal(date: number, slot: string, withStaples = false) {
    const title = mealText.trim()
    if (!title) return
    if (!withStaples) {
      await saveMeal(date, slot, title, [])
      return
    }
    setStaplesBusy(true)
    ai.aiStart()
    try {
      const res = await api<{ staples: string[] }>('meal-staples', { method: 'POST', body: { title } })
      if (res.staples.length) {
        // Start unchecked: the user ticks what they're MISSING (need to buy),
        // rather than un-ticking everything they already have.
        setStaplePrompt({ date, slot, title, options: res.staples.map((item) => ({ item, on: false })) })
      } else {
        await saveMeal(date, slot, title, [])
      }
    } catch (e) {
      if (isStatus(e, 503)) ai.markAiUnavailable()
      await saveMeal(date, slot, title, [])
    } finally {
      setStaplesBusy(false)
      ai.aiDone()
    }
  }

  // Plan a day's supper FROM a saved recipe AND confirm its staples for the list:
  // its own ingredients become the chips (no AI call — we already know them). The
  // recipe link rides along so the saved meal still opens the recipe.
  function chooseRecipeForMeal(date: number, slot: string, recipe: Recipe) {
    setEditDate(null)
    if (recipe.ingredients.length) {
      // Chips show buyable names ("Beurre non salé"), not measured recipe lines.
      const seen = new Set<string>()
      const options: { item: string; on: boolean }[] = []
      for (const ing of withoutHeadings(recipe.ingredients)) {
        const item = ingredientName(ing)
        const k = item.toLowerCase()
        if (item && !seen.has(k)) {
          seen.add(k)
          options.push({ item, on: false })
        }
      }
      setStaplePrompt({ date, slot, title: recipe.title, recipeId: recipe.id, options })
    } else {
      saveMeal(date, slot, recipe.title, [], recipe.id)
    }
  }

  // Toddler path: a child taps a recipe, then a day. This is an IDEA, not a plan —
  // a pre-reader shouldn't silently commit a real day's supper. So instead of
  // scheduling it, we drop the pick into the "Idées de repas" pool, keeping the
  // recipe link AND the chosen day (C-14 migration 0107 `date` column — a soft
  // scope, not a plan), so a parent sees the wish and places it for real later.
  // "suggestedBy" still records whose idea it was. The day used to be faked into
  // the title ("Muffin aux beignes (Mardi)"); it's a real column now, which lets
  // the IdeasDrawer's 👧 "Proposé par" chip surface it as a small chip on the
  // matching empty day tile (see lib/mealIdeas ideasForDay) instead of a parsed
  // string.
  async function kidSuggest(date: number, recipe: Recipe) {
    await write('meal-ideas', {
      method: 'POST',
      body: { title: recipe.title, recipeId: recipe.id, suggestedBy: profileId, date },
      affectedKeys: [MEAL_IDEAS_KEY],
    }).catch(() => {})
  }

  function toggleStaple(item: string) {
    setStaplePrompt((p) =>
      p ? { ...p, options: p.options.map((o) => (o.item === item ? { ...o, on: !o.on } : o)) } : p,
    )
  }

  return {
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
  }
}
