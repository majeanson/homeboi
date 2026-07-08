// "Cuisiner" — what to cook RIGHT NOW. Given the day's planned meals and the
// hour, pick the next slot to prepare (déjeuner → dîner → collation → souper),
// resolve it to a saved recipe, and hand back the cook-mode route. Shared by the
// kitchen ＋ "Cuisiner" tile and the board's "Préparer le repas" action so both
// land on the SAME recipe.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { RECIPES_KEY, type Recipe } from './recipes'
import { MEALS_KEY, type MealRow, type MealsData } from '../components/kitchen/types'
import { SLOT_RANK, type MealSlot, isMealSlot } from './mealSlots'

// One cookable choice in the "Cuisiner" picker: a planned meal that resolves to a
// saved recipe, its cook-mode route, and whether it's the one the app would
// auto-pick (the next meal due) — so the picker can mark/sort it first.
export interface CookChoice {
  meal: MealRow
  recipe: Recipe
  target: string
  isNext: boolean
}

// Which slot you're most likely about to cook, by local hour. Boundaries chosen
// so "Cuisiner" lands on the next meal you'd actually prepare, not the one that
// just passed: <10h déjeuner · <14h dîner · <16h collation · <20h souper ·
// else dessert (pickNextMeal's last-planned fallback still lands on the souper
// when no dessert is planned).
export function currentSlotRank(hour: number): number {
  if (hour < 10) return SLOT_RANK.breakfast
  if (hour < 14) return SLOT_RANK.lunch
  if (hour < 16) return SLOT_RANK.snack
  if (hour < 20) return SLOT_RANK.supper
  return SLOT_RANK.dessert
}

// The next meal to prepare among a day's planned meals: the first (in time order)
// whose slot hasn't passed yet; if the whole day's slots are behind us, fall back
// to the last planned meal (usually the souper) so the action is never dead when
// something IS planned. Undefined only when nothing is planned today.
export function pickNextMeal(todayMeals: MealRow[], hour: number): MealRow | undefined {
  const planned = todayMeals
    .filter((m) => isMealSlot(m.slot))
    .sort((a, b) => SLOT_RANK[a.slot as MealSlot] - SLOT_RANK[b.slot as MealSlot])
  if (!planned.length) return undefined
  const rank = currentSlotRank(hour)
  return planned.find((m) => SLOT_RANK[m.slot as MealSlot] >= rank) ?? planned[planned.length - 1]
}

// The minimum a meal needs to resolve to its recipe — a link and/or a title.
// Loosened from MealRow so the detail peek's MealLike (board + kitchen shapes)
// resolve too without importing the full row type. The React resolver hook that
// consumes this lives in components/kitchen/mealLookup (useRecipeForMeal).
export type MealLink = { recipe_id?: string | null; title: string }

// Resolve a planned meal to its saved recipe — exact link first, loose title
// match second. THE matcher; the kitchen hook + cook pickers all route through it.
// Undefined = a free-text meal with no matching recipe.
export function recipeForMeal(meal: MealLink, recipes: Recipe[]): Recipe | undefined {
  if (meal.recipe_id) {
    const byId = recipes.find((r) => r.id === meal.recipe_id)
    if (byId) return byId
  }
  const key = meal.title.trim().toLowerCase()
  return recipes.find((r) => r.title.trim().toLowerCase() === key)
}

// The next meal to cook + its recipe + the cook-mode route, from the shared
// meals/recipes caches. `enabled` gates the fetch (the ＋ sheet only needs it
// while open). `target` is null when nothing is planned or the meal has no
// matching recipe — callers fall back to the kitchen.
export function useNextMeal(enabled = true): { meal?: MealRow; recipe?: Recipe; target: string | null } {
  const { data: mealsData } = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), enabled })
  const { data: recipesData } = useQuery({
    queryKey: RECIPES_KEY,
    queryFn: () => api<{ recipes: Recipe[] }>('recipes'),
    enabled,
  })
  const today = mealsData?.weekStart ?? 0
  // weekStart is today's local midnight (the meals grid anchor) — today's meals
  // are the rows on that date, across every slot.
  const todayMeals = today ? (mealsData?.days ?? []).filter((m) => m.date === today) : []
  const meal = pickNextMeal(todayMeals, new Date().getHours())
  const recipe = meal ? recipeForMeal(meal, recipesData?.recipes ?? []) : undefined
  return { meal, recipe, target: recipe ? `/kitchen/recipe/${recipe.id}/cook` : null }
}

// Every cookable meal planned for TODAY, in time order — the choices the kitchen
// ＋ "Cuisiner" picker offers so you're not locked to just the next one. Only
// meals that resolve to a saved recipe make the list (a free-text meal has no
// cook mode to open); the meal `useNextMeal` would auto-pick is flagged `isNext`.
// Empty when nothing cookable is planned today. Same shared caches as useNextMeal.
//
// `allDays` widens the pool to EVERY planned day in the meals window (sorted by
// date then slot, today first) — used by the "Cuisiner ensemble" batch picker so
// you can cook dishes from any planned day at once, not just today's (#43).
export function useCookableMeals(enabled = true, allDays = false): CookChoice[] {
  const { data: mealsData } = useQuery({ queryKey: MEALS_KEY, queryFn: () => api<MealsData>('meals'), enabled })
  const { data: recipesData } = useQuery({
    queryKey: RECIPES_KEY,
    queryFn: () => api<{ recipes: Recipe[] }>('recipes'),
    enabled,
  })
  const today = mealsData?.weekStart ?? 0
  const days = mealsData?.days ?? []
  const todayMeals = today ? days.filter((m) => m.date === today) : []
  // The "cook now" pick is always today-anchored, even when we list every day.
  const next = pickNextMeal(todayMeals, new Date().getHours())
  const recipes = recipesData?.recipes ?? []
  const pool = allDays ? days : todayMeals
  return pool
    .filter((m) => isMealSlot(m.slot))
    // Today first, then by date; within a day by slot order.
    .sort((a, b) => a.date - b.date || SLOT_RANK[a.slot as MealSlot] - SLOT_RANK[b.slot as MealSlot])
    .map((meal): CookChoice | null => {
      const recipe = recipeForMeal(meal, recipes)
      if (!recipe) return null
      return { meal, recipe, target: `/kitchen/recipe/${recipe.id}/cook`, isNext: meal.id === next?.id }
    })
    .filter((c): c is CookChoice => c !== null)
}
