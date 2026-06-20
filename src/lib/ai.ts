import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { HEALTH_KEY, HOUSEHOLD_KEY } from './queryKeys'

// THE one place the SPA asks "may we show AI?". Every AI affordance (the capture
// router's sparkle, recipe import/read, the recap button, meal suggestions, the
// search "Ask") gates on `useAi().enabled` so turning AI off in Réglages ▸ IA hides
// them eagerly — not just after a call comes back degraded. It reads /api/health,
// where the server folds the two signals into one effective flag (see health.ts):
//   - enabled  — AI may run: the env.AI binding is wired AND the household hasn't
//                switched it off. This is what hides affordances + what every AI
//                endpoint enforces server-side, so the UI and the gate never drift.
//   - available — the binding is wired on this deployment (a fact). The toggle can
//                only ENABLE AI when this is true; otherwise there's nothing to turn on.
//
// `enabled` defaults to TRUE while the (persisted, usually warm) health query loads,
// so the AI-on majority never sees affordances flash away on boot; a household that
// turned AI off reads `false` straight from the persisted cache, so no flash either.
export interface AiState {
  enabled: boolean
  available: boolean
  loading: boolean
}

export function useAi(): AiState {
  const q = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: () => api<{ ai: boolean; aiAvailable: boolean }>('health'),
    staleTime: 5 * 60_000,
  })
  return {
    enabled: q.data?.ai ?? true,
    available: q.data?.aiAvailable ?? false,
    loading: q.isLoading,
  }
}

// Flip the household AI switch. PATCHes the household setting, then invalidates the
// health cache (so `enabled` flips app-wide) AND the household settings cache (so the
// toggle's own state refreshes). Returns the promise so the caller can show "saving".
export function useAiToggle(): (next: boolean) => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (next: boolean) => {
      await api('household', { method: 'PATCH', body: { aiEnabled: next } })
      qc.invalidateQueries({ queryKey: HEALTH_KEY })
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY })
    },
    [qc],
  )
}
