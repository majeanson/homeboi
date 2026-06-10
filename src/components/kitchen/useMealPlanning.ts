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
  async function saveMeal(date: number, title: string, staples: string[]) {
    setMealErr(false)
    try {
      await api('meals', { method: 'POST', body: { date, title, staples } })
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

  // Plan a day's supper FROM a saved recipe: its title fills the slot and its own
  // ingredients become the staple-confirm chips — so we skip the AI staples call
  // entirely (we already know them). The cook still ticks what they're missing.
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
      setStaplePrompt({ date, title: recipe.title, options })
    } else {
      saveMeal(date, recipe.title, [])
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
