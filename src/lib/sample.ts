import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { api } from './api'
import { SAMPLE_KEY } from './queryKeys'

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
