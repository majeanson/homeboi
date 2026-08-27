// The shell's idle cycle (HubLayout) re-arms on any `pointerdown`/`keydown` at
// `window` — the return-home drift and the screensaver both hang off that one
// `reset`. Two real interactions are INVISIBLE to it, and each was a bug:
//
//   1. **The screensaver's own wake tap.** `AmbientScreen.wake` calls
//      `stopPropagation()` on purpose — the gesture that wakes the screen must
//      not leak through onto a board control underneath. The side effect was
//      that the wake never reached the window listener: a pending return-home
//      drift could still fire seconds after someone woke the tablet, and the
//      screensaver didn't re-arm until the next unrelated touch.
//   2. **A hands-free voice capture.** Dictating past `idleMin` emits no pointer
//      and no key, so the screensaver could cover the person mid-sentence.
//
// Both now call `pokeIdle()`. HubLayout registers the shell's `reset` here (and
// unregisters on unmount); everything else stays a no-op when no shell is
// mounted (scenes, tests, the cast face). Deliberately NOT an event on `window`:
// the whole point is a channel the stopPropagation'd gesture can still reach.
let reset: (() => void) | null = null

// HubLayout only. Pass null to clear (cleanup, or when both idle behaviours are off).
export function registerIdleReset(fn: (() => void) | null): void {
  reset = fn
}

// "Treat this as activity": clears the screensaver + the drift warning and
// re-arms both timers from now. Safe to call when nothing is registered.
export function pokeIdle(): void {
  reset?.()
}
