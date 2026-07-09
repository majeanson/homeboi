import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { A_REGLER_KEY } from './queryKeys'
import { slotLabel } from './mealSlots'
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

// `enabled` gates the fetch to where it belongs: parent audience, not a read-only
// guest (a locked kiosk is toddler audience, so it's excluded already). The endpoint
// itself is a plain household read (kiosk-token OK); it short-circuits a guest actor
// to an empty scan rather than 401ing, since a guest's GET is otherwise allowed.
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
      // `sub` carries which day the empty hero meal is ('today' | 'tomorrow'); `label`
      // carries the hero SLOT, so a household whose headline is the dîner reads
      // « Dîner demain à planifier », not « Souper … ». A pre-upgrade cached payload
      // sent an empty label — fall back to the souper, which is what it meant.
      return {
        icon: 'cooking-pot-bold',
        text: t.aRegler.mealEmpty(
          slotLabel(f.label || 'supper', t),
          t.aRegler.dayWord[f.sub === 'today' ? 'today' : 'tomorrow'],
        ),
      }
    case 'meal-low':
      return { icon: 'carrot-bold', text: t.aRegler.mealLow(f.label, f.sub ?? '') }
    case 'birthday':
      return { icon: 'cake-bold', text: t.aRegler.birthday(f.label) }
  }
}
