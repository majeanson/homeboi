import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { KidView } from './KidView'

// The Routines tab, two lenses on the same data:
//   - toddler: the picture-card run (the original KidView), where the kid taps
//     and hears each step.
//   - parent: a read overview of who has which routine; building/editing still
//     lives in Réglages for now (the form there is unchanged).
export function Routines() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <KidView />
  return <RoutinesParent />
}

interface RoutineRow {
  id: string
  name: string
  memberName: string | null
  cards: unknown[]
}

function RoutinesParent() {
  const t = useT()
  const { data, error } = useQuery({
    queryKey: ['routines'],
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    ...live,
  })

  if (isUnauthorized(error)) return <PairPrompt />
  if (!data && !error) return <Loading />
  const routines = data?.routines ?? []

  return (
    <main className="narrow">
      <h1>{t.nav.routines}</h1>
      {routines.length === 0 ? (
        <p className="board__empty mono">{t.kid.none}</p>
      ) : (
        <ul className="operator__list">
          {routines.map((r) => (
            <li key={r.id}>
              <span>
                {r.name}
                {r.memberName ? ` · ${r.memberName}` : ''}
              </span>
              <span className="tag mono">{r.cards.length} 🃏</span>
            </li>
          ))}
        </ul>
      )}
      <p className="lead">
        <Link to="/settings">{t.audience.editInSettings}</Link>
      </p>
    </main>
  )
}
