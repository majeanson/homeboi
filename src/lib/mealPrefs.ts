import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import { MEAL_SLOTS, SLOT_COLOR, isMealSlot, type MealSlot } from './mealSlots'
import type { ReserveLocation } from './reservePrefs'

// Household settings as the board/kitchen read them. Only the meal fields matter
// here; postal/includedStores ride along (same endpoint) and are ignored.
export interface HouseholdSettings {
  postal?: string | null
  includedStores?: string[]
  mealColors?: Record<string, string> // slot → "#rrggbb" override (only set slots)
  mealHidden?: string[] // slots hidden from glance/plan; empty = show all
  measureColors?: Record<string, string> // measuring-tool swatchId → "#rrggbb" (only set tools)
  reserveLocations?: ReserveLocation[] | null // La réserve storage spots; null = seeded defaults
}

// The per-slot meal colour + visibility, resolved from the household settings.
// Used everywhere a meal is shown (board cards, month dots, kitchen) so a meal's
// colour is consistent and a hidden slot drops off the glance. Falls back to the
// built-in SLOT_COLOR defaults / "show all" when the settings haven't loaded or a
// slot has no override — so a kiosk that 401s on the read still renders sensibly.
export interface MealPrefs {
  color: (slot: string) => string | undefined
  isVisible: (slot: string) => boolean
  visibleSlots: MealSlot[]
}

export function useMealPrefs(): MealPrefs {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<HouseholdSettings>('household'),
    staleTime: 5 * 60_000,
  })
  const overrides = data?.mealColors ?? {}
  const hidden = new Set(data?.mealHidden ?? [])
  return {
    color: (slot) => (isMealSlot(slot) ? overrides[slot] ?? SLOT_COLOR[slot] : undefined),
    isVisible: (slot) => !hidden.has(slot),
    visibleSlots: MEAL_SLOTS.filter((s) => !hidden.has(s)),
  }
}
