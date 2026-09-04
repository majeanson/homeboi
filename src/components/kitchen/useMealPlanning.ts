import { useState } from 'react'
import { useWrite } from '../../lib/write'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { MEALS_KEY, MEAL_IDEAS_KEY, MEAL_HISTORY_KEY } from './types'
import { type Recipe } from '../../lib/recipes'

// The week-grid planning flow, extracted from the Kitchen page: type a day's
// supper, persist. Pure state + handlers — the page renders; this decides.

export function useMealPlanning(profileId: string | null) {
  const write = useWrite()
  const [editDate, setEditDate] = useState<number | null>(null)
  const [mealText, setMealText] = useState('')
  const [mealErr, setMealErr] = useState(false)

  // Persist the supper. On failure the edit state stays put (the typed title
  // isn't lost) and an error line appears — silently closing would read as
  // "saved" when nothing was.
  async function saveMeal(date: number, slot: string, title: string, recipeId?: string | null) {
    setMealErr(false)
    try {
      // Appends to the slot (a slot is a list now — see functions/api/meals.ts).
      // Offline this queues (resolves, no throw) and syncs on reconnect; a real
      // server rejection still throws → the error line shows, the title isn't lost.
      await write('meals', {
        method: 'POST',
        body: { date, slot, title, recipeId },
        affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
      })
      setEditDate(null)
      setMealText('')
    } catch {
      setMealErr(true)
    }
  }

  // Setting a meal from the typed title — a straight save, one step
  // (the AI grocery-staples opt-in this used to offer was removed 2026-09-04).
  async function beginSetMeal(date: number, slot: string) {
    const title = mealText.trim()
    if (!title) return
    await saveMeal(date, slot, title)
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

  return {
    editDate,
    setEditDate,
    mealText,
    setMealText,
    mealErr,
    saveMeal,
    beginSetMeal,
    kidSuggest,
  }
}
