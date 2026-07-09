import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { BOARD_KEY, ROUTINES_KEY } from './queryKeys'
import { useAmbient } from './ambient'
import { pickMomentRoutine } from './routineTod'

// « Un seul moteur ambiant » (C-13, bmad/10) — the screensaver (AmbientScreen), the
// cast ambient scene (which already reuses AmbientScreen), and the board's own
// « Prochainement » ribbon are all renderings of "what's next" over the SAME
// underlying event list, but used to carry their own clock ticker + next-up
// selector + breath/drift math. This module is the one seam: the pure selectors
// (`pickNextEventToday`, `breathAt`, `burnInDrift`) plus the `useAmbientScene` hook
// that AmbientScreen consumes for both the screensaver and the cast face. Board's
// own « Prochainement » (src/lib/boardModel.ts) calls `pickNextEventToday` with the
// `BOARD_NEXTUP` preset instead of re-deriving the same filter/sort inline.

export interface AmbientEvent {
  id: string
  title: string
  start_at: number
  all_day: number
}
export interface AmbientMeal {
  id: string
  title: string
}
export interface AmbientRoutine {
  id: string
  name: string
  timeOfDay: string | null
  color: string | null
  cards: { icon?: string }[]
  companion?: string | null
}

export interface NextUpOpts {
  // Whether an all-day item (a fête, a birthday) can itself BE "next" — the
  // screensaver has no better timed thing to lean on, so an all-day item counts;
  // the board's ribbon is timed-events-only (all-day items already have their own
  // band, so they'd never earn the "Prochainement" slot).
  includeAllDay: boolean
  // A just-started timed event still counts as "next" up to this many seconds
  // after its start (it's happening right now, not "coming up").
  graceSec: number
}

// The screensaver / cast "next up" line — zero grace (once a timed event is past,
// it's past) but an all-day fête/birthday still counts (nothing better to show).
export const SAVER_NEXTUP: NextUpOpts = { includeAllDay: true, graceSec: 0 }

// The live board's « Prochainement » ribbon — timed events only, a 30-minute grace
// so a just-started event still reads as "next" rather than vanishing the instant
// its start_at ticks past. boardModel.ts's `NEXT_UP_GRACE_SEC` (public since C-12,
// bmad/10, 53 tests pin it) is DERIVED from this preset's `graceSec` rather than
// the other way round — ambientScene.ts has no boardModel.ts import, so the two
// modules stay acyclic — but it's still ONE literal `1800`, never respelled.
export const BOARD_NEXTUP: NextUpOpts = { includeAllDay: false, graceSec: 1800 }

// The ONE "what's next today" selector — was duplicated (AmbientScreen's inline
// `next` filter/sort and boardModel's inline `nextUp`), each with a subtly
// different rule (all-day inclusion, grace window). Pure + generic over any
// event-shaped row, so it needs no React/DOM to unit-test.
export function pickNextEventToday<T extends { start_at: number; all_day: number }>(
  events: T[],
  nowSec: number,
  opts: NextUpOpts,
): T | null {
  const { includeAllDay, graceSec } = opts
  return (
    [...events]
      .filter((e) => (e.all_day ? includeAllDay : e.start_at >= nowSec - graceSec))
      .sort((a, b) => a.start_at - b.start_at)[0] ?? null
  )
}

// F-47 (bmad/08): the hourly breath — at the top of every hour the idle clock plays
// one slow 2 s scale (no sound, no badge). The window is the first ~20 s of the
// hour (10 s tick granularity gives it a comfortable margin either side). Callers
// AND this with the operator's `hourlyBreath` toggle (lib/ambient) — the window
// itself is always "true" at :00, the setting decides whether anyone sees it.
export function breathAt(nowMs: number): boolean {
  const d = new Date(nowMs)
  return d.getMinutes() === 0 && d.getSeconds() < 20
}

// E-37 (bmad/08): burn-in care — an always-on pixel drift for the always-on panel.
// The static clock/date/next block wanders a few px through a 5×5 grid, one step
// per minute (full loop ≈ 25 min), so no glyph parks on the same pixels for hours.
// Imperceptible (±4 px, eased in CSS); not a setting — furniture care, like the
// deepened night veil.
export function burnInDrift(nowMs: number): { x: number; y: number } {
  const d = new Date(nowMs)
  const drift = d.getHours() * 60 + d.getMinutes()
  return { x: ((drift % 5) - 2) * 2, y: ((Math.floor(drift / 5) % 5) - 2) * 2 }
}

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
