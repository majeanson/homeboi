// Ambient day-part drift (feature #1). theme-bootstrap.js sets the FIRST
// data-daypart before paint; this keeps it current while the app stays open:
// recompute on mount and every ~10 min so a wall tablet that runs all day slides
// dawn→morning→noon→afternoon→dusk→twilight→deep-twilight→night on its own. The
// two twilight rungs (set via themeForPart's data-theme tiers) make nightfall and
// wake-up gradual instead of a single cream→black cut. CALM by design — the shift
// is slow (CSS handles the transition) and only a few tokens move; this loop just
// flips the attributes, never re-renders React.
//
// Opt-out: when 'babillard-daypart-auto' === '0' we don't touch the attribute
// (the operator's manual day/night palette stays put). Date.now() is fine in app
// code (only forbidden inside Workflow scripts).
import { computeDayPart } from './timeofday'
import { isDaypartAuto, setDayPart, themeForPart, applyThemeAttr, type ThemeAttr } from './theme'

const TEN_MIN = 10 * 60 * 1000

// Put the palette on the CURRENT part right now: the `data-daypart` rung plus the
// day/night tier it implies. Returns the theme it applied so a caller that mirrors
// the binary day/night pip (Réglages ▸ Affichage) doesn't recompute it. Assumes the
// caller already checked `isDaypartAuto()`.
export function applyDaypartNow(): ThemeAttr {
  const part = computeDayPart(Date.now())
  setDayPart(part)
  // Auto day/night: the drift also flips the binary theme so the wall actually
  // goes dark at night, not just a dim cream (attribute-only — manual choice
  // preserved for when ambient is off).
  const theme = themeForPart(part)
  applyThemeAttr(theme)
  return theme
}

// Apply the current part now, then poll. Returns a cleanup that clears the timer.
//
// The interval is armed UNCONDITIONALLY — deliberately, even when the drift is
// currently off. This runs once at boot (main.tsx) and nothing restarts it, so
// the old `if (!isDaypartAuto()) return` meant a kiosk booted with the drift OFF
// and switched ON later showed the right tint at that instant (the toggle applies
// it) and then never advanced again until a reload. `tick` re-reads the flag, so
// an off session costs one no-op every 10 minutes and picks the drift back up on
// its own within one tick.
export function startDaypartDrift(): () => void {
  function tick() {
    // Re-check each tick: the operator can flip the toggle off mid-session, and
    // setDaypartAuto('off') already pinned the 'manual' sentinel — don't fight it.
    if (!isDaypartAuto()) return
    applyDaypartNow()
  }

  tick()
  const id = setInterval(tick, TEN_MIN)
  return () => clearInterval(id)
}
