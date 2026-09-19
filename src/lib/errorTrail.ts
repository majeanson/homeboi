// The last few things that went wrong in this tab, so « Les remarques » can carry them
// without anyone retyping a stack trace from a phone.
//
// WHY A RING AND NOT A LOG. This is a convenience attached to a report, never a record:
// it lives in memory, it dies with the tab, and it holds a handful of lines. Anything
// bigger would be a telemetry pipeline, which this app does not have and does not want
// — and a household board is the last place to grow one quietly.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not send anything anywhere. It is read
// exactly once, by the composer, at the moment a human decides to file a remark. That
// is the whole consent model, and it is why the composer SAYS the context travels along
// (`remarks.contextNote`) instead of collecting it silently.

const MAX = 6
const LINE_CAP = 300

const trail: { at: number; text: string }[] = []

/** Record one failure. Never throws — a broken error reporter must not break the app. */
export function noteError(text: unknown): void {
  try {
    const s = String(text ?? '').trim().slice(0, LINE_CAP)
    if (!s) return
    // Consecutive duplicates collapse: a render loop that throws sixty times a second
    // would otherwise flush every useful earlier line out of a six-slot ring.
    const last = trail[trail.length - 1]
    if (last && last.text === s) return
    trail.push({ at: Date.now(), text: s })
    while (trail.length > MAX) trail.shift()
  } catch {
    /* nothing here is worth an exception */
  }
}

/** Newest last, as plain strings. Safe to call anywhere, including before install(). */
export function recentErrors(): string[] {
  return trail.map((e) => e.text)
}

/**
 * Listen for what the browser already tells us: an uncaught error and an unhandled
 * rejection. Called once from main.tsx.
 *
 * It does NOT patch console.error. That would capture React's own development warnings
 * and every third-party library's chatter, which is noise in a report and a monkey-patch
 * in a shared global — two prices for something the two events below already cover.
 */
export function installErrorTrail(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => noteError(e.message || e.error))
  window.addEventListener('unhandledrejection', (e) => noteError((e as PromiseRejectionEvent).reason))
}
