import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import {
  DEFAULT_HERO,
  DEFAULT_SLOT_HOURS,
  DEFAULT_SLOT_ORDER,
  SLOT_COLOR,
  clockOrder,
  isMealSlot,
  rankFrom,
  slotAtMinute,
  type MealSlot,
} from './mealSlots'
import type { ReserveLocation } from './reservePrefs'

// Household settings as the board/kitchen read them. Only the meal fields matter
// here; postal/includedStores ride along (same endpoint) and are ignored.
export interface HouseholdSettings {
  postal?: string | null
  includedStores?: string[]
  mealColors?: Record<string, string> // slot → "#rrggbb" override (only set slots)
  mealHidden?: string[] // slots hidden from glance/plan; empty = show all
  mealOrder?: string[] // slot display order (Réglages ▸ Repas); server sends all five
  mealHero?: string // the day's headline slot
  mealHours?: Record<string, number> // slot → start, minutes from local midnight
  mealWindowDays?: number // « Jours affichés » — how far the meal grid reaches (7–14, default 10)
  measureColors?: Record<string, string> // measuring-tool swatchId → "#rrggbb" (only set tools)
  reserveLocations?: ReserveLocation[] | null // La réserve storage spots; null = seeded defaults
  aiEnabled?: boolean // household AI on/off switch (Réglages ▸ IA); the SPA gates AI on /api/health instead
}

// The per-slot meal colour, visibility, ORDER, HERO and HOURS, resolved from the
// household settings. Used everywhere a meal is shown so a meal's colour and its
// place in the day are consistent across the board, the kitchen and the month.
// Falls back to the built-in defaults when the settings haven't loaded or a slot
// has no override — so a kiosk that 401s on the read still renders sensibly.
export interface MealPrefs {
  color: (slot: string) => string | undefined
  isVisible: (slot: string) => boolean
  /** Every slot, in the household's display order (hidden ones included). */
  order: MealSlot[]
  /** The household's display order, minus hidden slots. */
  visibleSlots: MealSlot[]
  /** The display order minus the hero — the "also planned" slots beside it. */
  sideSlots: MealSlot[]
  /** The day's headline slot (board « Ce soir », kitchen day summary). */
  hero: MealSlot
  /** Sort key for a mixed list of meals: the slot's index in the display order. */
  rank: (slot: string) => number
  /** slot → start, minutes from local midnight. */
  hours: Record<MealSlot, number>
  /** The slots in wall-clock order (derived from `hours`, never from `order`). */
  clock: MealSlot[]
  /** Which slot a local minute-of-day falls in — drives « Prochain repas ». */
  slotAt: (minute: number) => MealSlot
}

// Normalize a saved order off the wire: known slots only, deduped, then any slot the
// server omitted appended in the default order. The server already guarantees this,
// but a persisted-cache read from an older build might not.
function normalizeOrder(saved: string[] | undefined): MealSlot[] {
  const seen = new Set<MealSlot>()
  const out: MealSlot[] = []
  for (const s of saved ?? []) if (isMealSlot(s) && !seen.has(s)) (seen.add(s), out.push(s))
  for (const s of DEFAULT_SLOT_ORDER) if (!seen.has(s)) out.push(s)
  return out
}

function normalizeHours(saved: Record<string, number> | undefined): Record<MealSlot, number> {
  const out = { ...DEFAULT_SLOT_HOURS }
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (isMealSlot(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 * 60) out[k] = v
  }
  return out
}

export function useMealPrefs(): MealPrefs {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<HouseholdSettings>('household'),
    staleTime: 5 * 60_000,
  })
  const overrides = data?.mealColors ?? {}
  const hidden = new Set(data?.mealHidden ?? [])
  const order = normalizeOrder(data?.mealOrder)
  const hours = normalizeHours(data?.mealHours)
  const hero = isMealSlot(data?.mealHero) ? data.mealHero : DEFAULT_HERO
  return {
    color: (slot) => (isMealSlot(slot) ? overrides[slot] ?? SLOT_COLOR[slot] : undefined),
    isVisible: (slot) => !hidden.has(slot),
    order,
    visibleSlots: order.filter((s) => !hidden.has(s)),
    sideSlots: order.filter((s) => s !== hero),
    hero,
    rank: rankFrom(order),
    hours,
    clock: clockOrder(hours),
    slotAt: (minute) => slotAtMinute(hours, minute),
  }
}
