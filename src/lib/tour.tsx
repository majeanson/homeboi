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
/** Exported for « Le point du jour »: its morning open yields to a device that has not
 *  met the welcome yet (lib/habitCheckin). */
export function hasTourSeen(id: string): boolean {
  return readSeen().includes(id)
}

// THE DAY THIS DEVICE FIRST OPENED THE APP — stamped here, in the module the SHELL
// already loads, and that placement is the whole point.
//
// « The first day belongs to the welcome » was written as « has this device met the
// essentials tour? », asked from inside `useHabitCheckinTrigger` — which lives in
// HubLayout, which has been a LAZY chunk since the door-weight pass. So on a real
// connection the order is: shell paints → tour starts → *board chunk still arriving* →
// visitor skips the welcome → HubLayout finally mounts → the tour is now SEEN, the
// stand-down branch is never taken, and the morning open throws the stranger into
// « Le point du jour ». Reproduced against production on 2026-09-22, three times: the
// board read « Chargement… » with the welcome drawn over it, and skipping inside that
// window was enough. The 2026-09-16 fix was correct and simply lived somewhere that did
// not exist yet.
//
// A first-boot date cannot race a mount order: it is a fact recorded once, by the shell,
// before any route chunk resolves. Stamped from `TourProvider` (mounted in main.tsx) and
// lazily on first read, so a device that somehow never mounts the provider still answers
// honestly rather than throwing.
const FIRST_DAY_KEY = 'babillard-first-day'

/** Local-midnight day number (the `habitToday()` unit), or 0 if storage is unavailable. */
function todayLocal(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

/** The day this device first booted the app. Stamps today on first call. */
export function firstRunDay(): number {
  try {
    const raw = Number(localStorage.getItem(FIRST_DAY_KEY))
    if (Number.isFinite(raw) && raw > 0) return raw
    const today = todayLocal()
    localStorage.setItem(FIRST_DAY_KEY, String(today))
    return today
  } catch {
    // Blocked storage: answer « today » rather than 0, so the quiet rule errs toward
    // quiet. A first screen that is too calm is not a defect.
    return todayLocal()
  }
}

/** True while this is still the device's very first day with the app. */
export function isFirstDay(): boolean {
  return firstRunDay() === todayLocal()
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
  /** Swap to another tour from inside one, marking the one you leave as seen. */
  branchTo: (id: string) => void
  // Run a Tour VALUE that isn't in the static TOURS list — the adaptive
  // « tour des trouvailles » (lib/discovery buildDiscoveryTour) assembles its
  // steps at runtime from this household's data, so it can't be registered
  // ahead of time. Same overlay, same seen-marking; only the lookup differs.
  startTour: (tour: Tour) => void
  next: () => void
  prev: () => void
  end: (reason: EndReason) => void
}

const TourContext = createContext<TourValue>({
  activeTour: null,
  stepIndex: 0,
  isActive: false,
  start: () => {},
  branchTo: () => {},
  startTour: () => {},
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

  // Stamp the device's first day from the SHELL, before any route chunk resolves — see
  // `firstRunDay`. Deliberately not in an effect body that could be skipped: reading it
  // is what writes it, and this is the earliest honest moment.
  firstRunDay()

  const end = useCallback((_reason: EndReason) => {
    // Both finishing and skipping mark the tour seen so it never nags again.
    setActiveTour((cur) => {
      if (cur) markTourSeen(cur.id)
      return null
    })
    setStepIndex(0)
  }, [])

  const startTour = useCallback(
    (tour: Tour) => {
      // Land on the tour's home route first, so step anchors exist (and a replay
      // launched from Réglages still works — it pulls the user back to the board).
      if (tour.startRoute) nav(tour.startRoute)
      setActiveTour(tour)
      setStepIndex(0)
    },
    [nav],
  )

  const start = useCallback(
    (id: string) => {
      const tour = TOURS.find((tr) => tr.id === id)
      if (!tour) return
      startTour(tour)
    },
    [startTour],
  )

  // Swap tours from inside one (the welcome card's « Voir les six sections »).
  //
  // It marks the tour you are LEAVING as seen, which matters: the auto-launch gates on
  // `essentials` having been seen, and someone who deliberately chose the long tour has
  // answered that question — without this they would be greeted by the same welcome
  // card again on the next load, having just taken the tour. Generic on purpose: any
  // future branch means "this tour has done its job", whatever it branched into.
  const branchTo = useCallback(
    (id: string) => {
      const tour = TOURS.find((tr) => tr.id === id)
      if (!tour) return
      setActiveTour((cur) => {
        if (cur) markTourSeen(cur.id)
        return cur
      })
      startTour(tour)
    },
    [startTour],
  )

  // A step may live on another route (the « Première fois » grand tour walks all six
  // sections). Navigate on ENTERING the step rather than inside next(), so stepping
  // BACKWARD across a section boundary returns you to that section too — a back button
  // that leaves you spotlighting an anchor on the wrong page is worse than no back.
  //
  // Same-route steps never navigate: `nav` to the path you are already on would push a
  // history entry per step and turn the browser Back button into a step-rewind.
  const step = activeTour?.steps[stepIndex]
  const stepRoute = step?.route
  useEffect(() => {
    if (!stepRoute) return
    const here = window.location.pathname + window.location.search
    if (here !== stepRoute) nav(stepRoute)
  }, [stepRoute, nav])

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
    branchTo,
    startTour,
    next,
    prev,
    end,
  }
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
