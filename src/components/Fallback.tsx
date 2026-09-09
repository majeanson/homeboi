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

// The failed-fetch state used to live here too, as a bare role="alert" line. It was
// a SECOND `LoadError`, same name, same job, told apart only by which module you
// imported — and it kept the two behaviours `components/LoadError.tsx` was written
// (2026-08-27/28, from Marc's phone) to refuse: it shouted in an error tone while
// the device was merely OFFLINE, and it offered no « Réessayer » on surfaces whose
// query has no poll to retry itself. Five call sites were still on it.
//
// There is now ONE: `components/LoadError.tsx`. Import it from there.
// `src/lib/devkitParity.test.ts` keeps the name from being re-declared here.

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
