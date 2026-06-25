import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import { DEFAULT_AISLE_ORDER, type AisleId, type AisleOverrides } from './aisle'

// The household's saved grocery aisle order (Réglages ▸ Magasinage), shared across
// every surface via the HOUSEHOLD_KEY cache. Falls back to the built-in store-walk
// order when unset or still loading, so the list always has a sensible "Par allée".
// `custom` tells the settings UI whether the household has saved its own order yet.
export function useAisleOrder(): { order: AisleId[]; custom: boolean } {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ aisleOrder?: string[] | null }>('household'),
    staleTime: 5 * 60_000,
  })
  const saved = (data?.aisleOrder ?? null) as AisleId[] | null
  return saved && saved.length ? { order: saved, custom: true } : { order: DEFAULT_AISLE_ORDER, custom: false }
}

// The household's per-item aisle overrides (corrections set in the list edit sheet),
// shared via the same HOUSEHOLD_KEY cache. Empty map when unset/loading.
export function useAisleOverrides(): AisleOverrides {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ aisleOverrides?: AisleOverrides | null }>('household'),
    staleTime: 5 * 60_000,
  })
  return data?.aisleOverrides ?? {}
}
