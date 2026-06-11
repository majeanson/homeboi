import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../../lib/api'
import { ingredientName } from '../../lib/ingredient'
import { type Recipe } from '../../lib/recipes'
import { MEALS_KEY } from './types'
import { type AiWake } from './useAiWake'

// The week-grid planning flow, extracted from the Kitchen page: type (or pick a
// recipe for) a day's supper, confirm its staples for the grocery list, persist.
// Pure state + handlers — the page renders; this decides.
export interface StaplePrompt {
  date: number
  title: string
  recipeId?: string | null // carried through so the saved meal keeps its recipe link
  options: { item: string; on: boolean }[]
}

export function useMealPlanning(ai: AiWake, profileId: string | null) {
  const qc = useQueryClient()
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
  async function saveMeal(date: number, title: string, staples: string[], recipeId?: string | null) {
    setMealErr(false)
    try {
      await api('meals', { method: 'POST', body: { date, title, staples, recipeId } })
      setEditDate(null)
      setMealText('')
      setStaplePrompt(null)
    } catch {
      setMealErr(true)
    } finally {
      qc.invalidateQueries({ queryKey: MEALS_KEY })
    }
  }

  // Setting a meal first asks the router for its staples (B3). If AI finds some,
  // we show the confirm chips; if AI is off (503) or finds nothing, we just save
  // the meal — the staple step is a bonus, never a gate (NFR-DEGRADE-1).
  async function beginSetMeal(date: number) {
    const title = mealText.trim()
    if (!title) return
    setStaplesBusy(true)
    ai.aiStart()
    try {
      const res = await api<{ staples: string[] }>('meal-staples', { method: 'POST', body: { title } })
      if (res.staples.length) {
        // Start unchecked: the user ticks what they're MISSING (need to buy),
        // rather than un-ticking everything they already have.
        setStaplePrompt({ date, title, options: res.staples.map((item) => ({ item, on: false })) })
      } else {
        await saveMeal(date, title, [])
      }
    } catch (e) {
      if (isStatus(e, 503)) ai.markAiUnavailable()
      await saveMeal(date, title, [])
    } finally {
      setStaplesBusy(false)
      ai.aiDone()
    }
  }

  // Plan a day's supper FROM a saved recipe AND confirm its staples for the list:
  // its own ingredients become the chips (no AI call — we already know them). The
  // recipe link rides along so the saved meal still opens the recipe.
  function chooseRecipeForMeal(date: number, recipe: Recipe) {
    setEditDate(null)
    if (recipe.ingredients.length) {
      // Chips show buyable names ("Beurre non salé"), not measured recipe lines.
      const seen = new Set<string>()
      const options: { item: string; on: boolean }[] = []
      for (const ing of recipe.ingredients) {
        const item = ingredientName(ing)
        const k = item.toLowerCase()
        if (item && !seen.has(k)) {
          seen.add(k)
          options.push({ item, on: false })
        }
      }
      setStaplePrompt({ date, title: recipe.title, recipeId: recipe.id, options })
    } else {
      saveMeal(date, recipe.title, [], recipe.id)
    }
  }

  // Toddler path: a child taps a recipe, then an empty day. This is a SUGGESTION,
  // not a decision — the server only fills an empty slot (unique-day index) and
  // records "suggested by" this device's child so a parent sees whose idea it was.
  async function kidSuggest(date: number, recipe: Recipe) {
    await api('meals', {
      method: 'POST',
      body: { date, title: recipe.title, suggest: true, suggestedBy: profileId },
    }).catch(() => {})
    qc.invalidateQueries({ queryKey: MEALS_KEY })
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
