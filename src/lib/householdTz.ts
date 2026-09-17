import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './api'
import { HOUSEHOLD_KEY } from './queryKeys'
import { setHouseholdTz } from './localDay'

// Point the client's day helpers at the HOUSEHOLD's zone (migration 0135, STATE §4-L
// L11). Everything dated in this app is bucketed at local midnight in that zone on the
// server; the client mirrors the same math (src/lib/localDay.ts), and until now it
// assumed America/Toronto — fine for the kiosk in the house, wrong for a phone carried
// anywhere else, and wrong for every household outside Québec once the app is public.
//
// One query, shared with every other reader of HOUSEHOLD_KEY (so it costs no extra
// request), and one effect. Deliberately NOT a context: the helpers are plain functions
// called from non-React code (lib/boardModel, lib/itemLife, the outbox), so the zone has
// to live in the module, not in a provider.
export function useHouseholdTzSync(): void {
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ tz?: string }>('household'),
    staleTime: 60 * 60_000,
    // A signed-out visitor has no household; asking would 401 on the marketing door.
    retry: false,
  })
  useEffect(() => {
    setHouseholdTz(data?.tz)
  }, [data?.tz])
}
