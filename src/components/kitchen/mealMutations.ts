import { type QueryClient } from '@tanstack/react-query'
import { writeWith } from '../../lib/write'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type Recipe } from '../../lib/recipes'
import { MEALS_KEY, MEAL_HISTORY_KEY, type MealRow, type MealsData } from './types'

// Meal-plan mutations shared by the calm week grid (Kitchen) and the day editor
// (DayPlanPage). Pure functions over the query client — no component state — so
// the grid's day-to-day drag and the editor's cross-slot drag call the same code.

// Plan ONE meal into a day+slot, straight from the week grid's empty cell — the
// common case ("mardi: spaghetti") no longer costs a full-screen day scene (7 of
// them to fill a week; friction audit, plan seam #8). The day scene stays the
// place for the rest (sides, notes, a recipe link, who cooks). Same endpoint and
// keys as every other meal write, so offline/undo/realtime behave identically.
export async function planMeal(qc: QueryClient, date: number, slot: string, title: string) {
  const v = title.trim()
  if (!v) return
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { date, slot, title: v },
    affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
  })
}

// Plan a SAVED RECIPE straight into a day+slot — links it, no staples prompt (that
// AI-suggested-grocery-items opt-in was removed 2026-09-04; add ingredients from
// the recipe's own view instead). Shared by the week grid's empty-day picker and
// the day editor's slot fields, so the two doors can't drift.
export async function planMealRecipe(qc: QueryClient, date: number, slot: string, recipe: Recipe) {
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { date, slot, title: recipe.title, recipeId: recipe.id },
    affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
  }).catch(() => {})
}

// Drag-to-move: drop a meal on another day (slot kept) or another slot (same day).
// The server appends it to the tail of the target slot; `slot` omitted preserves
// the meal's current slot (a day→day drag). Optimistic so the row jumps at once,
// then the invalidate reconciles the authoritative order/position. The board
// re-reads too (today's supper headline lives there).
export async function reschedule(qc: QueryClient, id: string, toDate: number, slot?: string) {
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { action: 'reschedule', id, toDate, slot },
    affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
    optimistic: (c) =>
      c.setQueryData<MealsData>(MEALS_KEY, (d) =>
        d ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, date: toDate, slot: slot ?? m.slot } : m)) } : d,
      ),
  }).catch(() => {})
}

// Re-create a set of removed meals from their snapshot (the undo inverse). Each
// comes back as a fresh row in the same day+slot — order/id may differ, the plan
// reads as restored. Refresh the board too (today's supper shows there).
export async function restoreMeals(qc: QueryClient, meals: MealRow[]) {
  for (const m of meals) {
    await writeWith(qc, 'meals', {
      method: 'POST',
      body: { date: m.date, slot: m.slot, title: m.title, recipeId: m.recipe_id ?? null },
      affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
    }).catch(() => {})
  }
}
