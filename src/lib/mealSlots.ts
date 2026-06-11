// The meals of a Québec day: déjeuner / dîner / souper, plus a collation (snack).
// `supper` stays the primary slot — the board headline, the kid suggestion target,
// the shop-the-week driver — so it's last here and rendered prominently; the
// others are lighter "also planned" slots in the week grid.
export const MEAL_SLOTS = ['breakfast', 'lunch', 'supper', 'snack'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

// The three "side" slots shown beside the souper in the week grid.
export const SIDE_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack']

export const SLOT_ICON: Record<MealSlot, string> = {
  breakfast: '🍳',
  lunch: '☀️',
  supper: '🌙',
  snack: '🍎',
}

export const isMealSlot = (v: unknown): v is MealSlot =>
  typeof v === 'string' && (MEAL_SLOTS as readonly string[]).includes(v)
