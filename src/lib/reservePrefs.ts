import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import { useT } from '../i18n'

// Storage locations for La réserve, resolved from the household settings. The
// spots are custom & editable (Réglages ▸ Réserve, stored as a JSON column,
// migration 0036). When the household has never configured them the stored value
// is null and we fall back to the two SEEDED defaults below — localized, which is
// why they live here (client-side) and not in the backend validator. An explicit
// stored array (including an empty one = "removed them all") is the household's
// own choice and wins over the defaults.

export interface ReserveLocation {
  id: string
  name: string
  color?: string // "#rrggbb"
}

// Stable ids for the two seeded defaults — kept fixed so renaming/recolouring a
// default in Réglages never re-buckets the items already filed under it.
const DEFAULT_PANTRY_ID = 'pantry'
const DEFAULT_FREEZER_ID = 'freezer'

// The two seeded defaults (Garde-manger + Congélateur), built from localized
// names so the hook AND the Réglages editor agree on the starting point. Soft
// palette tints (honey / sky).
export function seedReserveDefaults(pantryName: string, freezerName: string): ReserveLocation[] {
  return [
    { id: DEFAULT_PANTRY_ID, name: pantryName, color: '#e0a93d' },
    { id: DEFAULT_FREEZER_ID, name: freezerName, color: '#7bb0c9' },
  ]
}

export interface ReservePrefs {
  locations: ReserveLocation[] // resolved (the seeded defaults when untouched)
  name: (id: string | null | undefined) => string // "Autres" for unknown / null
  color: (id: string | null | undefined) => string | undefined
}

export function useReserveLocations(): ReservePrefs {
  const t = useT()
  const defaults = seedReserveDefaults(t.kitchen.reserveDefaultPantry, t.kitchen.reserveDefaultFreezer)
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ reserveLocations?: ReserveLocation[] | null }>('household'),
    staleTime: 5 * 60_000,
  })
  // null / undefined (not yet configured or not yet loaded) → seeded defaults; an
  // array (incl. []) → the household's own list.
  const stored = data?.reserveLocations
  const locations = stored == null ? defaults : stored
  const byId = new Map(locations.map((l) => [l.id, l]))
  return {
    locations,
    name: (id) => (id ? byId.get(id)?.name : undefined) ?? t.kitchen.reserveOther,
    color: (id) => (id ? byId.get(id)?.color : undefined),
  }
}
