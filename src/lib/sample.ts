import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAuth } from './auth'
import { api } from './api'
import { useNotice } from './toast'
import { SAMPLE_KEY } from './queryKeys'

// The ONE way the examples doors write (« Charger », « Vider », « Repartir les
// exemples à neuf » — on the WelcomeCard, the board banner and Réglages ▸ Découvrir).
// All five handlers used to be the same try/finally with no catch: a failed request
// re-enabled the button and said nothing, so a family tapping « Charger des exemples »
// on a flaky connection saw nothing happen and could not know why (2026-09-23).
//
// `run` takes the calls (they stay at the call site, where write-rule.test.ts
// allowlists them) and owns what repeats: one busy flag, a refetch of everything
// afterwards — on failure TOO, since a half-done reset (cleared, not reseeded) must
// show what is really there — and the one calm line (useNotice) when it did not work.
export function useSampleWrite() {
  const t = useT()
  const qc = useQueryClient()
  const notice = useNotice()
  const [busy, setBusy] = useState(false)
  const run = async (calls: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await calls()
    } catch {
      notice(t.common.saveFailed)
    } finally {
      await qc.invalidateQueries()
      setBusy(false)
    }
  }
  return { busy, run }
}

// Shared read of "does this household still have the seeded demo data?" — the
// single gate that sequences first-run onboarding (onboarding UX pass):
//   • demo present  → the board shows ONLY the explore banner (SampleBanner);
//                     the setup checklist (WelcomeCard) stays hidden, because
//                     "add your family" makes no sense while a demo family fills
//                     the board (and would even read as already-done).
//   • demo cleared  → the checklist takes over — the real "Start here".
// Operator-scoped: the query only runs for a signed-in session (a kiosk neither
// manages nor is shown this). `pending` lets callers avoid flashing the checklist
// before we know whether demo data is present.
export function useSampleStatus() {
  const { signedIn } = useAuth()
  const { data, isPending } = useQuery({
    queryKey: SAMPLE_KEY,
    queryFn: () => api<{ count: number }>('seed'),
    enabled: signedIn,
  })
  const count = data?.count ?? 0
  return { count, hasSample: count > 0, pending: signedIn && isPending }
}
