import { useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEscapeKey } from '../lib/sceneNav'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { ROUTINES_KEY } from '../lib/queryKeys'
import { loadStateOf, PairPrompt } from '../components/Fallback'
import { isGuest } from '../lib/device'
import { RoutinePlayer, type PlayerRoutine } from '../components/RoutinePlayer'

// /routine/:id/run — RUN one routine on ANY surface. The toddler kiosk reaches the
// player through KidView's face-picker; this standalone scene is the door for a
// parent on their phone (or any device) who taps ▶ "Faire la routine" on the
// Routines tab. Same shared RoutinePlayer, same data, no audience lock — exits back
// to La maison rather than /board.
export function RoutineRunPage() {
  const ro = isGuest()
  const { id } = useParams()
  const nav = useNavigate()
  // The player's exit is a Link (a touch door); Escape is its keyboard mirror — every
  // other full-screen scene already has one (2026-11-05, the one scene without).
  useEscapeKey(() => nav('/maison'))
  const routinesQ = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: PlayerRoutine[] }>('routines'),
    ...live,
  })
  const { data, error } = routinesQ

  if (isUnauthorized(error)) return <div className="kid"><PairPrompt /></div>
  const wait = loadStateOf(routinesQ)
  if (wait) return <div className="kid">{wait}</div>
  const routine = data?.routines.find((r) => r.id === id) ?? null
  // Gone (deleted elsewhere) or an empty shell with no steps → nothing to run;
  // bounce back to the tab rather than show an empty stage.
  if (!routine || routine.cards.length === 0) return <Navigate to="/maison" replace />

  return <RoutinePlayer routine={routine} ro={ro} exitTo="/maison" />
}
