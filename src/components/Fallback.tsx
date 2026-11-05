import { type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useSurface } from '../lib/surface'
import { LoadError } from './LoadError'
import { Skeleton } from './Skeleton'

// The two states every data page shares before it has rows to show, factored out
// so the wording/markup stays identical everywhere and a copy never drifts.

// Shown while the first fetch is in flight. `children` replaces the word when the
// wait has a better one (« Recherche… » over a flyer search) — the markup stays THE one
// (`.loading` belongs to this file: kit-class-rule.test.ts).
export function Loading({ children }: { children?: ReactNode } = {}) {
  const t = useT()
  return <p className="loading mono">{children ?? t.common.loading}</p>
}

// THE pre-data face of a query, decided in ONE place (2026-11-05). A surface that
// wrote `if (!data) return <Loading />` by hand sat on « Chargement… » FOREVER once
// the fetch had errored with nothing cached — sixteen scenes did, and two hub tabs
// (La liste, La cuisine) rendered a FALSE EMPTY instead: a week with no meals, a list
// with no rows, when the truth was « the network did not answer ». The three faces:
//
//   data === undefined && isError → <LoadError onRetry>   (names the wait, offers a door)
//   data === undefined            → <Skeleton> if the caller knows the SHAPE, else <Loading>
//   data !== undefined            → null — render the surface (a failed POLL keeps the
//                                   last good frame; that is Query's job, not this one's)
//
// `data !== undefined`, never `status === 'success'`: a failed poll flips status to
// 'error' while the last good frame STAYS cached (CLAUDE.md « Does this query hold
// data? »). The `shape` rule is Skeleton.tsx's: a skeleton is a promise about shape,
// so a form scene or one record you have never opened passes none.
//
//   const wait = loadStateOf(q, { shape: 'card', count: 4 })
//   if (wait) return wait
//
// Two queries: `loadStateOf(a) ?? loadStateOf(b)`. A query that is DISABLED (no id yet)
// reads as loading — gate it at the call site (`id ? loadStateOf(q) : null`).
// `src/lib/load-error-rule.test.ts` fails a file that renders <Loading>/<Skeleton>
// without this (or LoadError) in reach.
export interface LoadStateQuery {
  data: unknown
  isError: boolean
  refetch: () => unknown
}
export interface LoadStateShape {
  /** The surface's known shape, if any — reserves the space instead of a centred line. */
  shape?: 'row' | 'card'
  count?: number
}
export function loadStateOf(q: LoadStateQuery, opts: LoadStateShape = {}): ReactElement | null {
  if (q.data !== undefined) return null
  if (q.isError) return <LoadError onRetry={() => void q.refetch()} />
  return opts.shape ? <Skeleton variant={opts.shape} count={opts.count} /> : <Loading />
}

// The same decision as a JSX wrapper, for a surface that renders the wait INLINE
// (inside a scene body or a modal) rather than as an early return. `children` may be a
// function so the surface reads `q.data` only once it is there.
export function LoadState({
  q,
  shape,
  count,
  children,
}: LoadStateShape & { q: LoadStateQuery; children: ReactNode | (() => ReactNode) }) {
  const wait = loadStateOf(q, { shape, count })
  if (wait) return wait
  return <>{typeof children === 'function' ? children() : children}</>
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
