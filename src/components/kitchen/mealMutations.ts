import { type QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MEALS_KEY, type MealRow, type MealsData } from './types'

// Meal-plan mutations shared by the calm week grid (Kitchen) and the day editor
// (DayPlanPage). Pure functions over the query client — no component state — so
// the grid's day-to-day drag and the editor's cross-slot drag call the same code.

// Drag-to-move: drop a meal on another day (slot kept) or another slot (same day).
// The server appends it to the tail of the target slot; `slot` omitted preserves
// the meal's current slot (a day→day drag). Optimistic so the row jumps at once,
// then the invalidate reconciles the authoritative order/position. The board
// re-reads too (today's supper headline lives there).
export async function reschedule(qc: QueryClient, id: string, toDate: number, slot?: string) {
  qc.setQueryData<MealsData>(MEALS_KEY, (d) =>
    d ? { ...d, days: d.days.map((m) => (m.id === id ? { ...m, date: toDate, slot: slot ?? m.slot } : m)) } : d,
  )
  await api('meals', { method: 'POST', body: { action: 'reschedule', id, toDate, slot } }).catch(() => {})
  qc.invalidateQueries({ queryKey: MEALS_KEY })
  qc.invalidateQueries({ queryKey: ['board'] })
}

// Re-create a set of removed meals from their snapshot (the undo inverse). Each
// comes back as a fresh row in the same day+slot — order/id may differ, the plan
// reads as restored. Refresh the board too (today's supper shows there).
export async function restoreMeals(qc: QueryClient, meals: MealRow[]) {
  for (const m of meals) {
    await api('meals', {
      method: 'POST',
      body: { date: m.date, slot: m.slot, title: m.title, recipeId: m.recipe_id ?? null },
    }).catch(() => {})
  }
  qc.invalidateQueries({ queryKey: MEALS_KEY })
  qc.invalidateQueries({ queryKey: ['board'] })
}
