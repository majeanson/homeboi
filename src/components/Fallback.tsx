import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useSurface } from '../lib/surface'

// The two states every data page shares before it has rows to show, factored out
// so the wording/markup stays identical everywhere and a copy never drifts.

// Shown while the first fetch is in flight.
export function Loading() {
  const t = useT()
  return <p className="loading mono">{t.common.loading}</p>
}

// Shown when the API says 401 — this device has no household. The right door
// depends on the device's ROLE: a wall tablet pairs (device token), a phone
// signs in (operator session). Offer the primary one for this surface and keep
// the other reachable underneath.
export function PairPrompt() {
  const t = useT()
  const { surface } = useSurface()
  return (
    <main className="narrow pairprompt">
      <p className="lead">{t.pair.lead}</p>
      {surface === 'kiosk' ? (
        <>
          <Link to="/pair" className="btn btn--primary">
            {t.home.ctaPair}
          </Link>
          <Link to="/login" className="btn btn--ghost mono">
            {t.login.title}
          </Link>
        </>
      ) : (
        <>
          <Link to="/login" className="btn btn--primary">
            {t.login.title}
          </Link>
          <Link to="/pair" className="btn btn--ghost mono">
            {t.home.ctaPair}
          </Link>
        </>
      )}
    </main>
  )
}
