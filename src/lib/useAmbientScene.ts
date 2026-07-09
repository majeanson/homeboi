import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { BOARD_KEY, ROUTINES_KEY } from './queryKeys'
import { useAmbient } from './ambient'
import { pickMomentRoutine } from './routineTod'
import {
  pickNextEventToday,
  breathAt,
  burnInDrift,
  SAVER_NEXTUP,
  type AmbientEvent,
  type AmbientMeal,
  type AmbientRoutine,
} from './ambientScene'

// fix(ci): the hook half of C-13's ambient engine (bmad/10) — split out of
// lib/ambientScene.ts so THAT module stays a pure, React/query-free set of
// selectors. boardModel.ts (eager, part of the Board bundle) only ever needs
// the pure `pickNextEventToday`/`BOARD_NEXTUP` — importing them from a module
// that also pulled in useQuery/api/useAmbient/routineTod dragged that whole
// hook-shaped dependency graph into the eager entry chunk (Rollup's default
// chunking merges a module's full import graph with whichever chunk reaches
// it), which is what pushed combined eager JS 15 KB over budget in CI run
// 28991809068. Keeping the hook here — importing the pure selectors from
// ambientScene.ts rather than the reverse — means boardModel.ts's import chain
// never touches React Query or the routine/ambient hooks at all.

export interface AmbientScene {
  now: number
  nowSec: number
  next: AmbientEvent | null
  meal: AmbientMeal | undefined
  routine: AmbientRoutine | undefined
  breath: boolean
  drift: { x: number; y: number }
}

// The one ambient-scene provider (C-13): AmbientScreen calls this for its clock +
// next-up event + tonight's meal + the routine of the moment + breath/drift — a
// single seam the screensaver AND the cast ambient face both ride, instead of each
// carrying its own ticker/selector. `active` = the screen is actually showing
// (AmbientScreen's `show` prop, or `true` for the permanent cast face); the 10 s
// tick is gated on it and re-seeds `now` the instant the screen activates, so a
// screensaver that's been hidden for hours never flashes a stale clock on wake.
export function useAmbientScene(active: boolean): AmbientScene {
  const a = useAmbient()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [active])
  const nowSec = Math.floor(now / 1000)

  // Next event + tonight's meal ride the already-cached /api/board frame the board
  // itself polls — no extra load on a fresh kiosk. Deliberately NOT the shared
  // `live` query options (lib/query): an idle screensaver must not join the
  // realtime-poll pool (free-tier request budget) — it's fine to catch up on wake.
  const { data } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ today: AmbientEvent[]; tonight: AmbientMeal | null }>('board'),
    enabled: active && a.showNext,
  })
  const next = a.showNext ? pickNextEventToday(data?.today ?? [], nowSec, SAVER_NEXTUP) : null
  const meal = a.showNext ? data?.tonight ?? undefined : undefined

  // The routine that fits the moment — its own query (only while the screen is up,
  // so the board poll stays lean), the same ROUTINES_KEY cache the Routines tab
  // fills. A cue, never a nag — it just surfaces, it doesn't blink or count.
  const { data: rdata } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: AmbientRoutine[] }>('routines'),
    enabled: active && a.showNext,
  })
  const routine = a.showNext ? pickMomentRoutine(rdata?.routines ?? [], now) : undefined

  const breath = a.hourlyBreath && breathAt(now)
  const drift = burnInDrift(now)

  return { now, nowSec, next, meal: meal ?? undefined, routine, breath, drift }
}
