import { type QueryClient } from '@tanstack/react-query'
import { writeWith, writeFailed } from '../../lib/write'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { type Recipe } from '../../lib/recipes'
import { MEALS_KEY, MEAL_HISTORY_KEY, type MealRow, type MealsData, type UnplacedMeal } from './types'

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
  }).catch(writeFailed)
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
  }).catch(writeFailed)
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
    }).catch(writeFailed)
  }
}

// ── « À placer » (mig 0155): the week's meals with no day yet. A meal keeps its id
// as it hops between the bin and a day, so each move is optimistic as « this row
// changes lists » — it jumps at once under the finger, and the invalidate settles
// the server's position. Same endpoint + keys as every other meal write.

// A planned meal leaves its day for the bin (its slot rides along, so a dîner dragged
// off and back is still a dîner). `linkId` (mig 0156): the bin group it joins — a
// supper headline of two meals dragged off its day lands as a linked pair, because on
// the day they already moved as one.
export async function unplaceMeal(qc: QueryClient, meal: MealRow, linkId: string | null = null) {
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { action: 'unplace', id: meal.id, ...(linkId ? { linkId } : {}) },
    affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
    optimistic: (c) =>
      c.setQueryData<MealsData>(MEALS_KEY, (d) =>
        d
          ? {
              ...d,
              days: d.days.filter((m) => m.id !== meal.id),
              unplaced: [
                ...(d.unplaced ?? []).filter((u) => u.id !== meal.id),
                { id: meal.id, title: meal.title, recipe_id: meal.recipe_id ?? null, slot: meal.slot, is_leftover: meal.is_leftover ?? 0, position: Number.MAX_SAFE_INTEGER, link_id: linkId },
              ],
            }
          : d,
      ),
  }).catch(writeFailed)
}

// A bin row lands on a day, in `slot` (the caller resolves « its own slot, else the
// hero » — the server does the same, this only paints it right away).
export async function placeMeal(qc: QueryClient, u: UnplacedMeal, toDate: number, slot: string) {
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { action: 'place', id: u.id, toDate, slot },
    affectedKeys: [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY],
    optimistic: (c) =>
      c.setQueryData<MealsData>(MEALS_KEY, (d) =>
        d
          ? {
              ...d,
              unplaced: (d.unplaced ?? []).filter((x) => x.id !== u.id),
              days: [
                ...d.days.filter((m) => m.id !== u.id),
                { id: u.id, date: toDate, slot, title: u.title, cook_member_id: null, recipe_id: u.recipe_id, is_leftover: u.is_leftover, position: Number.MAX_SAFE_INTEGER },
              ],
            }
          : d,
      ),
  }).catch(writeFailed)
}

// A fresh bin group key, minted on the client so the optimistic paint and the server
// agree on it (the server accepts only this shape — see asLinkId in api/meals.ts).
export function newLinkId(): string {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (const b of crypto.getRandomValues(new Uint8Array(12))) out += a[b % a.length]
  return out
}

// Regroup « À placer » rows (mig 0156): `groups` is the bin's grouping as it should
// read AFTER the gesture — every list of two or more becomes one linked group, a list
// of one goes back to alone. Linking two neighbours and cutting a group in two are the
// same write, and each is undone by the opposite tap on the same connector.
export async function relinkUnplaced(qc: QueryClient, groups: string[][]) {
  const keyOf = new Map<string, string | null>()
  for (const g of groups) {
    const k = g.length > 1 ? newLinkId() : null
    for (const id of g) keyOf.set(id, k)
  }
  await writeWith(qc, 'meals', {
    method: 'POST',
    body: { action: 'link', groups },
    affectedKeys: [MEALS_KEY],
    optimistic: (c) =>
      c.setQueryData<MealsData>(MEALS_KEY, (d) =>
        d ? { ...d, unplaced: (d.unplaced ?? []).map((u) => (keyOf.has(u.id) ? { ...u, link_id: keyOf.get(u.id) ?? null } : u)) } : d,
      ),
  }).catch(writeFailed)
}

/** The bin's rows as their groups, in reading order: a group sits where its first
 *  row sits, and its rows follow in their own order. A key only one row carries (its
 *  partner was placed or removed) reads as alone. */
export function unplacedGroups<T extends { id: string; link_id?: string | null }>(rows: T[]): T[][] {
  const out: T[][] = []
  const at = new Map<string, T[]>()
  for (const r of rows) {
    const k = r.link_id
    const g = k ? at.get(k) : undefined
    if (g) g.push(r)
    else {
      const ng = [r]
      out.push(ng)
      if (k) at.set(k, ng)
    }
  }
  return out
}
