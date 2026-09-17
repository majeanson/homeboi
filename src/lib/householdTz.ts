import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './api'
import { useAuth } from './auth'
import { isGuest, isPaired } from './device'
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
// ONLY asked when there is a credential to ask with. A stranger on the marketing page
// has no household, and asking anyway put a 401 in their console on every load — the
// same shape as the credential-less socket the live walk found the first time, and
// found again here, on the walk's first run after this shipped (2026-09-17). The three
// credentials that DO have a household: a signed-in operator, a paired kiosk, a link
// guest. `retry: false` stays for the case where one of them is stale.
export function useHouseholdTzSync(): void {
  const { signedIn } = useAuth()
  const { data } = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ tz?: string }>('household'),
    enabled: signedIn || isPaired() || isGuest(),
    staleTime: 60 * 60_000,
    retry: false,
  })
  useEffect(() => {
    setHouseholdTz(data?.tz)
  }, [data?.tz])
}
