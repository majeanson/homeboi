// Read cook durations out of a recipe step ("mijoter 20 minutes", "1h30",
// "10-12 min", "cuire 45 s") so Cook mode can offer a one-tap timer. Forgiving
// by design: anything it can't confidently read is simply not offered — it never
// rewrites or misreads the step (NFR-DEGRADE). FR + EN units.
//
// Ranges ("10-12 min", "10 à 12 minutes") resolve to the UPPER bound: a timer
// you can stop early beats one that buzzes before the dish is done.

export interface Duration {
  label: string
  seconds: number
}

// One scan, alternation ordered most-specific first so "1h30" is read whole
// rather than as "1 h" + a bare "30". Single-letter units (h/m/s) are guarded by
// \b, so "20 ml" / "5 sac" / "200 g" never read as minutes/seconds.
const TOKEN = new RegExp(
  // 1h30 / 1 h 30 / 1h30min  → hours + minutes
  '(?<h1>\\d+)\\s*h(?:eures?| rs?|rs?|r)?\\s*(?<m1>\\d{1,2})(?:\\s*(?:minutes?|mins?|min|m)\\b)?' +
    '|' +
    // 2 heures / 1.5 h / 2 hours  → hours (decimal ok)
    '(?<h2>\\d+(?:[.,]\\d+)?)\\s*(?:heures?|hours?|hrs?|hr|h)\\b' +
    '|' +
    // 20 minutes / 10-12 min / 10 à 12 minutes / 5 m  → minutes (range → upper)
    '(?<m2>\\d+)(?:\\s*(?:-|–|à|to)\\s*(?<m2b>\\d+))?\\s*(?:minutes?|mins?|min|m)\\b' +
    '|' +
    // 45 secondes / 30 s / 20 sec  → seconds
    '(?<s2>\\d+)\\s*(?:secondes?|seconds?|secs?|sec|s)\\b',
  'gi',
)

// "1 h 30 min" / "20 min" / "45 s" — concise, unit abbreviations read the same
// in FR and EN.
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0 s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (h) parts.push(`${h} h`)
  if (m) parts.push(`${m} min`)
  if (s) parts.push(`${s} s`)
  return parts.join(' ')
}

export function findDurations(text: string): Duration[] {
  const out: Duration[] = []
  const seen = new Set<number>()
  for (const m of text.matchAll(TOKEN)) {
    const g = m.groups!
    let seconds = 0
    if (g.h1 != null) seconds = +g.h1 * 3600 + +g.m1 * 60
    else if (g.h2 != null) seconds = Math.round(parseFloat(g.h2.replace(',', '.')) * 3600)
    else if (g.m2 != null) seconds = (g.m2b != null ? +g.m2b : +g.m2) * 60
    else if (g.s2 != null) seconds = +g.s2
    if (seconds > 0 && !seen.has(seconds)) {
      seen.add(seconds)
      out.push({ label: formatDuration(seconds), seconds })
    }
  }
  // A step rarely has more than a couple of real timers; cap so a number-heavy
  // line can't sprout a wall of chips.
  return out.slice(0, 3)
}
