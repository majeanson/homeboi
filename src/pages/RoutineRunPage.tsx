import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { Loading, PairPrompt } from '../components/Fallback'
import { isGuest } from '../lib/device'
import { RoutinePlayer, type PlayerRoutine } from '../components/RoutinePlayer'

// /routine/:id/run — RUN one routine on ANY surface. The toddler kiosk reaches the
// player through KidView's face-picker; this standalone scene is the door for a
// parent on their phone (or any device) who taps ▶ "Faire la routine" on the
// Routines tab. Same shared RoutinePlayer, same data, no audience lock — exits back
// to the Routines tab rather than /board.
export function RoutineRunPage() {
  const ro = isGuest()
  const { id } = useParams()
  const { data, error } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: PlayerRoutine[] }>('routines'),
    ...live,
  })

  if (isUnauthorized(error)) return <div className="kid"><PairPrompt /></div>
  if (!data && !error) return <Loading />
  const routine = data?.routines.find((r) => r.id === id) ?? null
  // Gone (deleted elsewhere) or an empty shell with no steps → nothing to run;
  // bounce back to the tab rather than show an empty stage.
  if (!routine || routine.cards.length === 0) return <Navigate to="/routines" replace />

  return <RoutinePlayer routine={routine} ro={ro} exitTo="/routines" />
}
