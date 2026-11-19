import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { ROUTINES_KEY } from './queryKeys'
import { pickMomentRoutine } from './routineTod'

// THE routine of the moment, for every board lens: the parent's « Prochaine routine »
// card, the toddler's ▶ door and the simple lens's routine tile. One query (the same
// ROUTINES_KEY cache the Maison tab and the screensaver fill) and one pick
// (`pickMomentRoutine`), so the three lenses cannot name different routines at the same
// minute. Non-polling (staleTime): a board card never adds /api/routines to the board
// poll, and realtime nudges keep it fresh after another device's tick.
// Generic over the row shape each caller reads; the endpoint returns all of them.
export function useMomentRoutine<T extends { timeOfDay: string | null; cards: { icon?: string }[] }>(): T | undefined {
  const { data } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: T[] }>('routines'),
    staleTime: 5 * 60_000,
  })
  return pickMomentRoutine(data?.routines ?? [], Date.now())
}
