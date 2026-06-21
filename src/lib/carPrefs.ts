import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import { useT } from '../i18n'

// The household's vehicle(s) for « L'auto », resolved from the household settings.
// Custom & editable (Réglages ▸ L'auto, stored as a JSON column, migration 0067).
// When the household has never configured them the stored value is null and we fall
// back to ONE seeded default (« L'auto ») — localized, which is why it lives here
// (client-side) and not in the backend validator. An explicit stored array
// (including an empty one = "we have no car", a carpool-only household) is the
// household's own choice and wins over the default.

export interface Car {
  id: string
  name: string
  color?: string // "#rrggbb"
}

// Stable id for the single seeded default — kept fixed so renaming/recolouring it
// in Réglages never re-points the rides already filed under it.
const DEFAULT_CAR_ID = 'car'

// The one seeded default (« L'auto »), built from a localized name so the hook AND
// the Réglages editor agree on the starting point. Soft slate tint.
export function seedCarDefaults(carName: string): Car[] {
  return [{ id: DEFAULT_CAR_ID, name: carName, color: '#6b7a8f' }]
}

export interface CarPrefs {
  cars: Car[] // resolved (the seeded default when untouched)
  hasCar: boolean // false only when the household explicitly stored an empty list
  name: (id: string | null | undefined) => string | undefined
  color: (id: string | null | undefined) => string | undefined
  primary: Car | null // the first car — the default pick for a ride
}

export function useCars(): CarPrefs {
  const t = useT()
  const defaults = seedCarDefaults(t.operator.carDefaultName)
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ cars?: Car[] | null }>('household'),
    staleTime: 5 * 60_000,
  })
  // null / undefined (not yet configured or not yet loaded) → seeded default; an
  // array (incl. []) → the household's own list.
  const stored = data?.cars
  const cars = stored == null ? defaults : stored
  const byId = new Map(cars.map((c) => [c.id, c]))
  return {
    cars,
    hasCar: cars.length > 0,
    name: (id) => (id ? byId.get(id)?.name : undefined),
    color: (id) => (id ? byId.get(id)?.color : undefined),
    primary: cars[0] ?? null,
  }
}
