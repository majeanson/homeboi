// "Cuisiner" — what to cook RIGHT NOW. Given the day's planned meals and the
// hour, pick the next slot to prepare (déjeuner → dîner → collation → souper),
// resolve it to a saved recipe, and hand back the cook-mode route. Shared by the
// kitchen ＋ "Cuisiner" tile and the board's "Préparer le repas" action so both
// land on the SAME recipe.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { RECIPES_KEY, type Recipe } from './recipes'
import { MEALS_KEY, type MealRow, type MealsData } from '../components/kitchen/types'
import { DEFAULT_SLOT_HOURS, clockOrder, isMealSlot, slotAtMinute, type MealSlot } from './mealSlots'
import { useMealPrefs } from './mealPrefs'

// One cookable choice in the "Cuisiner" picker: a planned meal that resolves to a
// saved recipe, its cook-mode route, and whether it's the one the app would
// auto-pick (the next meal due) — so the picker can mark/sort it first.
export interface CookChoice {
  meal: MealRow
  recipe: Recipe
  target: string
  isNext: boolean
}

// "Cuisiner" reasons on the WALL CLOCK, never on the household's display order — a
// household that drags the dessert to the top of Réglages ▸ Repas has reordered a
// list, not moved dessert before breakfast. So everything here ranks by `hours`
// (each slot's start, Réglages ▸ Repas) via clockOrder/slotAtMinute, which default
// to <10h déjeuner · <14h dîner · <16h collation · <20h souper · else dessert.
const clockRankFor = (hours: Record<MealSlot, number>) => {
  const rank = new Map(clockOrder(hours).map((s, i) => [s, i]))
  return (slot: string) => rank.get(slot as MealSlot) ?? 9
}

// The next meal to prepare among a day's planned meals: the first (in clock order)
// whose slot hasn't passed yet; if the whole day's slots are behind us, fall back
// to the last planned meal (usually the hero) so the action is never dead when
// something IS planned. Undefined only when nothing is planned today. `minute` is
// the local minute-of-day; `hours` defaults to the built-in slot start times.
export function pickNextMeal(
  todayMeals: MealRow[],
  minute: number,
  hours: Record<MealSlot, number> = DEFAULT_SLOT_HOURS,
): MealRow | undefined {
  const rankOf = clockRankFor(hours)
  const planned = todayMeals.filter((m) => isMealSlot(m.slot)).sort((a, b) => rankOf(a.slot) - rankOf(b.slot))
  if (!planned.length) return undefined
  const now = rankOf(slotAtMinute(hours, minute))
  return planned.find((m) => rankOf(m.slot) >= now) ?? planned[planned.length - 1]
}

// The local minute-of-day, the unit pickNextMeal and the slot `hours` both speak.
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

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
  const { hours } = useMealPrefs()
  const today = mealsData?.weekStart ?? 0
  // weekStart is today's local midnight (the meals grid anchor) — today's meals
  // are the rows on that date, across every slot.
  const todayMeals = today ? (mealsData?.days ?? []).filter((m) => m.date === today) : []
  const meal = pickNextMeal(todayMeals, minuteOfDay(new Date()), hours)
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
  const { hours } = useMealPrefs()
  const today = mealsData?.weekStart ?? 0
  const days = mealsData?.days ?? []
  const todayMeals = today ? days.filter((m) => m.date === today) : []
  // The "cook now" pick is always today-anchored, even when we list every day.
  const next = pickNextMeal(todayMeals, minuteOfDay(new Date()), hours)
  const recipes = recipesData?.recipes ?? []
  const pool = allDays ? days : todayMeals
  const clockRank = clockRankFor(hours)
  return pool
    .filter((m) => isMealSlot(m.slot))
    // Today first, then by date; within a day in clock order — this is a "what do I
    // cook next" queue, so it follows the clock, not the display order.
    .sort((a, b) => a.date - b.date || clockRank(a.slot) - clockRank(b.slot))
    .map((meal): CookChoice | null => {
      const recipe = recipeForMeal(meal, recipes)
      if (!recipe) return null
      return { meal, recipe, target: `/kitchen/recipe/${recipe.id}/cook`, isNext: meal.id === next?.id }
    })
    .filter((c): c is CookChoice => c !== null)
}
