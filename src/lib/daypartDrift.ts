// Ambient day-part drift (feature #1). theme-bootstrap.js sets the FIRST
// data-daypart before paint; this keeps it current while the app stays open:
// recompute on mount and every ~10 min so a wall tablet that runs all day slides
// dawn→morning→afternoon→dusk→night on its own. CALM by design — the palette
// shift is slow (CSS handles the transition) and only a few tokens move; this
// loop just flips the attribute, never re-renders React.
//
// Opt-out: when 'babillard-daypart-auto' === '0' we don't touch the attribute
// (the operator's manual day/night palette stays put). Date.now() is fine in app
// code (only forbidden inside Workflow scripts).
import { computeDayPart } from './timeofday'
import { isDaypartAuto, setDayPart } from './theme'

const TEN_MIN = 10 * 60 * 1000

// Apply the current part now, then poll. Returns a cleanup that clears the timer.
export function startDaypartDrift(): () => void {
  if (!isDaypartAuto()) return () => {}

  function tick() {
    // Re-check each tick: the operator can flip the toggle off mid-session, and
    // setDaypartAuto('off') already pinned the 'manual' sentinel — don't fight it.
    if (!isDaypartAuto()) return
    setDayPart(computeDayPart(Date.now()))
  }

  tick()
  const id = setInterval(tick, TEN_MIN)
  return () => clearInterval(id)
}
