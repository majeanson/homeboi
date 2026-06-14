import type { IconName } from '../components/Icon'

// The meals of a Québec day: déjeuner / dîner / souper, plus a collation (snack).
// `supper` stays the primary slot — the board headline, the kid suggestion target,
// the shop-the-week driver — so it's rendered prominently; the others are lighter
// "also planned" slots. A slot can hold SEVERAL meals (migration 0033).
export const MEAL_SLOTS = ['breakfast', 'lunch', 'supper', 'snack'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

// The order meals are DISPLAYED in — by time of day: déjeuner, dîner, collation,
// souper. (Distinct from MEAL_SLOTS, which keeps supper before snack for the
// "supper is primary" grid layout.) Use this anywhere meals are listed in order,
// and mirror it in the SQL CASE in meals.ts / board.ts / month.ts.
export const SLOT_TIME_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'supper']

// Rank for sorting a mixed list of meals by time. Keep in sync with the SQL CASE.
export const SLOT_RANK: Record<MealSlot, number> = { breakfast: 0, lunch: 1, snack: 2, supper: 3 }

// The three "side" slots shown beside the souper, in time order.
export const SIDE_SLOTS: MealSlot[] = SLOT_TIME_ORDER.filter((s) => s !== 'supper')

// A distinct, real icon per slot (no emoji) — shown everywhere a meal/slot appears
// (board, month, kitchen grid, capture). Food-forward so a meal never reads as the
// generic carrot category glyph. See src/components/Icon.tsx for the registry.
export const SLOT_ICON_NAME: Record<MealSlot, IconName> = {
  breakfast: 'egg-bold',
  lunch: 'fork-knife-bold',
  snack: 'cookie-bold',
  supper: 'bowl-food-bold',
}

// The DEFAULT colour per slot, used until the operator picks an override in
// Réglages ▸ Repas. Warm-to-cool across the day so the slots read apart at a
// glance; souper keeps the meal-category terracotta (CATS.meal.color) so the
// board looks unchanged out of the box. All drawn from the household PALETTE
// (lib/colors). Resolve an actual colour for a slot via useMealPrefs().color().
export const SLOT_COLOR: Record<MealSlot, string> = {
  breakfast: '#E0A93D', // honey — morning
  lunch: '#7BB0C9', // sky — midday
  snack: '#B06A93', // berry — afternoon
  supper: '#E0724E', // terracotta — the day's hero meal
}

export const isMealSlot = (v: unknown): v is MealSlot =>
  typeof v === 'string' && (MEAL_SLOTS as readonly string[]).includes(v)
