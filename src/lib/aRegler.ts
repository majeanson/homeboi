import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { A_REGLER_KEY } from './queryKeys'
import type { Dict } from '../components/board/types'
import type { IconName } from '../components/Icon'

// « À régler » — the cross-domain heads-up (functions/api/a-regler). The endpoint
// returns STRUCTURED signals; the localized sentence + icon are composed here so all
// copy stays in i18n. Shared by the board card (ARegler) and the « Cette semaine »
// block, so neither re-derives the rendering.
export type FrictionKind = 'ride' | 'meal-empty' | 'meal-low' | 'birthday'

export interface Friction {
  kind: FrictionKind
  key: string
  label: string
  sub?: string
  at?: number
  href: string
}

// A slow poll like the weather chip — it's a calm background scan, not render-critical.
const FIVE_MIN = 5 * 60 * 1000

// `enabled` gates the fetch to where it belongs (operator, non-kiosk, non-toddler) —
// the endpoint is operator-only, so a kiosk/guest would just 401.
export function useARegler(enabled: boolean) {
  return useQuery({
    queryKey: A_REGLER_KEY,
    queryFn: () => api<{ signals: Friction[] }>('a-regler'),
    enabled,
    staleTime: FIVE_MIN,
    refetchInterval: FIVE_MIN,
    retry: false,
  })
}

// One signal → an icon + a human line, in the app language. Pure (takes `t`).
export function frictionRow(f: Friction, t: Dict): { icon: IconName; text: string } {
  switch (f.kind) {
    case 'ride':
      return { icon: 'car-bold', text: t.aRegler.ride(f.label) }
    case 'meal-empty':
      // `sub` carries which day the empty supper is ('today' | 'tomorrow').
      return {
        icon: 'cooking-pot-bold',
        text: t.aRegler.mealEmpty(t.aRegler.dayWord[f.sub === 'today' ? 'today' : 'tomorrow']),
      }
    case 'meal-low':
      return { icon: 'carrot-bold', text: t.aRegler.mealLow(f.label, f.sub ?? '') }
    case 'birthday':
      return { icon: 'cake-bold', text: t.aRegler.birthday(f.label) }
  }
}
