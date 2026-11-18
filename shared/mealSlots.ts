// The meal slots and their OUT-OF-THE-BOX layout, one copy for the Worker and the SPA (review
// #40). Order, hero and hours are household settings (Réglages ▸ Repas): these are only the
// defaults until a household changes them, and what the server fills a short PATCH from.

// The five slots, in their stored/enum order (supper before snack for historical reasons, NOT
// a display order — iterate a household's `order` instead).
export const MEAL_SLOTS = ['breakfast', 'lunch', 'supper', 'snack', 'dessert'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

// The built-in display order, by time of day.
export const DEFAULT_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'supper', 'dessert']

// The souper is the day's hero out of the box: the board headline, the kid suggestion target,
// the shop-the-week driver.
export const DEFAULT_HERO: MealSlot = 'supper'

// « Jours affichés » — how far the meal grid reaches, counting today. The server clamps whatever
// arrives to [MIN, MAX]; the bounds come from two surfaces, not taste: the toddler kitchen
// slices `week.slice(0, 7)` (never below 7) and functions/api/ask.ts snapshots `today+14d` for
// the AI (never above 14). The picker in Réglages ▸ Cuisine ▸ Repas offers the three.
export const WINDOW_DAYS_MIN = 7
export const WINDOW_DAYS_MAX = 14
export const WINDOW_DAYS_DEFAULT = 10
export const WINDOW_DAYS_OPTIONS = [WINDOW_DAYS_MIN, WINDOW_DAYS_DEFAULT, WINDOW_DAYS_MAX] as const

// When each meal is SERVED, in minutes from local midnight. An ordinary Québec day.
export const DEFAULT_SLOT_HOURS: Record<MealSlot, number> = {
  breakfast: 7 * 60, // 07:00
  lunch: 12 * 60, // 12:00 — le dîner
  snack: 15 * 60, // 15:00
  supper: 17 * 60 + 30, // 17:30 — le souper
  dessert: 20 * 60, // 20:00
}
