import { Link } from 'react-router-dom'
import { useT } from '../i18n'

// The two states every data page shares before it has rows to show, factored out
// so the wording/markup stays identical everywhere and a copy never drifts.

// Shown while the first fetch is in flight.
export function Loading() {
  const t = useT()
  return <p className="loading mono">{t.common.loading}</p>
}

// Shown when the API says 401 — this browser isn't paired to a household yet, so
// the only useful action is to pair/sign in.
export function PairPrompt() {
  const t = useT()
  return (
    <main className="narrow">
      <Link to="/pair" className="btn btn--primary">
        {t.home.ctaPair}
      </Link>
    </main>
  )
}
