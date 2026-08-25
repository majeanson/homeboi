import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { createDeviceStore } from './createDeviceStore'
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

// Does « Mon ordre » print each row's aisle under its name? Default NO.
//
// The aisle is worth knowing sometimes, not always: on every row it repeats
// « Autres » down half the list and pushes the item's own name — the one thing the
// row exists to say — into second place. « Par allée » already answers "where is
// this in the store" by grouping under headers; this is the way to ask the same
// question WITHOUT regrouping, on demand.
//
// DEVICE-LOCAL (localStorage, not household data): a view preference the kiosk and
// the phone each keep their own, and one a read-only guest may use — it writes
// nothing to /api/*. Read through createDeviceStore's useSyncExternalStore so the
// rows re-render the moment it's toggled, in every tab.
const aisleTags = createDeviceStore<boolean>('babillard-liste-aisle-tags', false, {
  read: (raw) => raw === '1',
  write: (on) => (on ? '1' : '0'),
})
export const setAisleTagsShown = aisleTags.set
export const useAisleTagsShown = aisleTags.use
