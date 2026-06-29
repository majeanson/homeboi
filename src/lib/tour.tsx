// The guided-tour engine: a tiny state machine + a "seen" record, exposed as a
// context so any part of the app can start a tour (or a one-off coachmark) and so
// the single overlay (components/tour/TourOverlay.tsx) can render the active step.
// Generic on purpose — tours and their copy live in lib/tourContent.ts; this file
// knows nothing about a specific tour. Same context+localStorage shape as Calm/
// Help (see main.tsx), guarded with try/catch so storage quirks never break boot.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAudience } from './audience'
import { useAuth } from './auth'
import { isGuest, isPaired } from './device'
import { useSurface } from './surface'
import { TOURS, type Tour } from './tourContent'

// One key holds the SET of finished/skipped tour ids (JSON array), so adding more
// tours later each track independently without new storage keys.
const SEEN_KEY = 'babillard-tours-seen'

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function hasTourSeen(id: string): boolean {
  return readSeen().includes(id)
}
function markTourSeen(id: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]))
  } catch {
    /* noop */
  }
}

type EndReason = 'finished' | 'skipped'

type TourValue = {
  activeTour: Tour | null
  stepIndex: number
  isActive: boolean
  start: (id: string) => void
  next: () => void
  prev: () => void
  end: (reason: EndReason) => void
}

const TourContext = createContext<TourValue>({
  activeTour: null,
  stepIndex: 0,
  isActive: false,
  start: () => {},
  next: () => {},
  prev: () => {},
  end: () => {},
})

export const useTour = () => useContext(TourContext)

export function TourProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate()
  const { audience } = useAudience()
  const { signedIn } = useAuth()
  const { surface } = useSurface()
  const [activeTour, setActiveTour] = useState<Tour | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  const end = useCallback((_reason: EndReason) => {
    // Both finishing and skipping mark the tour seen so it never nags again.
    setActiveTour((cur) => {
      if (cur) markTourSeen(cur.id)
      return null
    })
    setStepIndex(0)
  }, [])

  const start = useCallback(
    (id: string) => {
      const tour = TOURS.find((tr) => tr.id === id)
      if (!tour) return
      // Land on the tour's home route first, so step anchors exist (and a replay
      // launched from Réglages still works — it pulls the user back to the board).
      if (tour.startRoute) nav(tour.startRoute)
      setActiveTour(tour)
      setStepIndex(0)
    },
    [nav],
  )

  const next = useCallback(() => {
    if (!activeTour) return
    if (stepIndex + 1 >= activeTour.steps.length) end('finished')
    else setStepIndex(stepIndex + 1)
  }, [activeTour, stepIndex, end])

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  // Auto-launch the essentials tour ONCE, for a parent, the first time — never on a
  // locked/toddler kiosk. Runs for EITHER a signed-in operator OR a paired wall
  // kiosk (the flagship surface): the kiosk families mount on the wall carries only
  // a device token (isPaired), never an auth session, so gating on `signedIn` alone
  // skipped the very tablet that most needs the 30-second orientation. `signedIn`
  // flips true after the auth check resolves; `surface` is in the deps so a tablet
  // that pairs mid-session (Pair → setSurface('kiosk')) still triggers. The ref
  // guards the StrictMode double-run + later re-renders. Skipping/finishing sets the
  // seen flag, so it won't return.
  const autoTried = useRef(false)
  useEffect(() => {
    if (autoTried.current) return
    if (audience !== 'parent') return
    if (!signedIn && !isPaired()) return
    // Never onboard a guest / cast surface — the tour is operator/kiosk-only. A sitter
    // / family / welcome / cast link carries a guest token (isGuest), and the « Diffuser
    // au salon » TV board lives at /cast; neither should ever get the spotlight tour.
    // (Don't set autoTried here, so a later normal session in this tab still runs it.)
    if (isGuest() || window.location.pathname.startsWith('/cast')) return
    autoTried.current = true
    if (!hasTourSeen('essentials')) start('essentials')
  }, [audience, signedIn, surface, start])

  const value: TourValue = {
    activeTour,
    stepIndex,
    isActive: activeTour != null,
    start,
    next,
    prev,
    end,
  }
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
