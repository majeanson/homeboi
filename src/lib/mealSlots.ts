import type { IconName } from '../components/Icon'
import type { Dict } from '../components/board/types'

// The meals of a Québec day: déjeuner / dîner / souper, plus a collation (snack)
// and a dessert (after the souper). A slot can hold SEVERAL meals (migration 0033).
//
// Three things about a slot are HOUSEHOLD SETTINGS (Réglages ▸ Repas), not constants
// — read them through `useMealPrefs()` (lib/mealPrefs), never off a module constant:
//   • ORDER — where the slot appears in a list. `DEFAULT_SLOT_ORDER` is only the
//     out-of-the-box value.
//   • HERO  — which slot is the day's headline. `supper` by default, which is why
//     it's rendered prominently and the others are lighter "also planned" slots.
//   • HOURS — the slot's start time. The wall-clock order is DERIVED from these
//     (see `clockOrder`), so reordering the list never claims dessert comes before
//     breakfast on the clock.
//
// MEAL_SLOTS is the storage/type-level set — the five valid `slot` values. It is NOT
// a display order (it keeps supper before snack for historical reasons); iterate a
// household's `order` instead.
export const MEAL_SLOTS = ['breakfast', 'lunch', 'supper', 'snack', 'dessert'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

// The built-in display order, by time of day — used until the household reorders.
// Mirrored by DEFAULT_SLOT_ORDER in functions/_lib/mealSlots.ts (the server builds
// its ORDER BY from the household's saved order, defaulting to this).
export const DEFAULT_SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'supper', 'dessert']

// The day's headline slot, out of the box.
export const DEFAULT_HERO: MealSlot = 'supper'

// When each meal is SERVED, in minutes from local midnight. An ordinary Québec day.
export const DEFAULT_SLOT_HOURS: Record<MealSlot, number> = {
  breakfast: 7 * 60, // 07:00
  lunch: 12 * 60, // 12:00 — le dîner
  snack: 15 * 60, // 15:00
  supper: 17 * 60 + 30, // 17:30 — le souper
  dessert: 20 * 60, // 20:00
}

// How long a meal stays "the one you're cooking" after it's served. Past this, the day
// has moved on to the next meal — so at 11 h the déjeuner is behind you and
// « Cuisiner » offers the dîner, not the breakfast you already ate. The SAME window
// decides when the board strikes a meal through (lib/itemLife `mealSlotPast`), so a
// meal is crossed out exactly when it stops being the meal you'd cook.
export const SLOT_GRACE_MIN = 90

// A distinct, real icon per slot (no emoji) — shown everywhere a meal/slot appears
// (board, month, kitchen grid, capture). Food-forward so a meal never reads as the
// generic carrot category glyph. See src/components/Icon.tsx for the registry.
export const SLOT_ICON_NAME: Record<MealSlot, IconName> = {
  breakfast: 'egg-bold',
  lunch: 'fork-knife-bold',
  snack: 'cookie-bold',
  supper: 'bowl-food-bold',
  dessert: 'cake-bold',
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
  dessert: '#7E6FB0', // lavender — the sweet end of the evening
}

export const isMealSlot = (v: unknown): v is MealSlot =>
  typeof v === 'string' && (MEAL_SLOTS as readonly string[]).includes(v)

// THE localized label for a meal slot ("Souper", "Déjeuner"…), falling back to the
// raw key for an unknown/custom slot. One home for the `t.kitchen.slots[slot] ?? slot`
// lookup that was copy-pasted across the board views and inlined in the kitchen.
export const slotLabel = (slot: string, t: Dict): string =>
  (t.kitchen.slots as Record<string, string>)[slot] ?? slot

// What the board's headline card is CALLED. The souper — the default hero — earns the
// warmer « Ce soir »; any other promoted slot is named plainly ("Dîner"), because
// "Ce soir" would be a lie above a lunch. One home for the choice, so the board, the
// simple lens and the detail peek can't disagree about it.
export const heroCardLabel = (hero: MealSlot, t: Dict): string =>
  hero === 'supper' ? t.board.tonight : slotLabel(hero, t)

// slot → its index in the given display order. Sorting a mixed list of meals by this
// puts them in the household's order; an unknown slot parks after the known five.
export function rankFrom(order: MealSlot[]): (slot: string) => number {
  const rank = new Map<string, number>(order.map((s, i) => [s, i]))
  return (slot) => rank.get(slot) ?? 9
}

// The slots in WALL-CLOCK order — by start time, ties broken by DEFAULT_SLOT_ORDER so
// the result is total and stable. Distinct from the display order on purpose.
export function clockOrder(hours: Record<MealSlot, number>): MealSlot[] {
  return [...DEFAULT_SLOT_ORDER].sort(
    (a, b) => hours[a] - hours[b] || DEFAULT_SLOT_ORDER.indexOf(a) - DEFAULT_SLOT_ORDER.indexOf(b),
  )
}

// The meal the moment belongs to: the first, in clock order, that isn't over yet (a
// meal is over SLOT_GRACE_MIN after it's served). Deliberately looks FORWARD — at
// 11 h it answers "le dîner", not the déjeuner that just passed, which is what
// « Cuisiner » wants. In the small hours it clamps to the day's first meal (you're
// waiting on it, not past the dessert); after the last meal's window it clamps to
// that last meal. Drives « Prochain repas ».
export function slotAtMinute(hours: Record<MealSlot, number>, minute: number): MealSlot {
  const clock = clockOrder(hours)
  for (const s of clock) if (minute < hours[s] + SLOT_GRACE_MIN) return s
  return clock[clock.length - 1]
}

// "16:00" → "16 h" / "16 h 30" (FR) · "4 PM" / "4:30 PM" (EN). The Réglages row label
// and the slot hint chips read the same way.
export function formatSlotHour(minute: number, lang: 'fr' | 'en'): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  if (lang === 'fr') return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
