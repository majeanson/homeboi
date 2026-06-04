import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, ApiError } from '../lib/api'
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
  const [routines, setRoutines] = useState<RoutineRow[] | null>(null)
  const [unauth, setUnauth] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api<{ routines: RoutineRow[] }>('routines')
      setRoutines(res.routines)
      setUnauth(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUnauth(true)
      else setRoutines([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (unauth) {
    return (
      <main className="narrow">
        <Link to="/pair" className="btn btn--primary">
          {t.home.ctaPair}
        </Link>
      </main>
    )
  }
  if (!routines) return <p className="loading mono">{t.common.loading}</p>

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
