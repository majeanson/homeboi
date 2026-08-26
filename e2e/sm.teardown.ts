import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// How few visible characters counts as "this screen shows almost nothing". Not a
// failure — a REVIEW FLAG. It is the signal that caught /notes: 133 chars, the
// lowest in the table, because the fixture served zero notes and the tab whose whole
// brief was "maximum note per pixel" was being measured on an empty page. The number
// existed in the manifest for a week and nobody (me) read it, which is why it now
// gets hoisted into a `review` block instead of sitting in a column.
const LOW_CONTENT_CHARS = 200

type State = {
  name: string
  pass: boolean
  assertions: {
    contentTopPx?: number | null
    contentBudgetPx?: number
    contentEmptyVia?: string
    aboveFoldChars?: number
  }
}

// Merge the per-state fragments the matrix tests wrote (parallel workers can't
// append to one file without racing) into ONE manifest.json — the entry point
// for a review pass: read the manifest, open the failing/interesting PNGs.
export default function mergeManifest() {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'screenshots', 'matrix')
  if (!existsSync(dir)) return
  const frags = readdirSync(dir).filter((f) => f.startsWith('.frag-') && f.endsWith('.json'))
  const states: State[] = frags
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))

  // The review block: what a session should LOOK at, ranked, without reading 64
  // rows. Everything here is advisory — the hard failures already failed the run.
  const withChars = states.filter((s) => typeof s.assertions.aboveFoldChars === 'number')
  const review = {
    // Screens showing almost no text above the fold. Either the surface is genuinely
    // sparse (fine — say so) or its fixture is empty and any budget on it is a lie.
    lowContent: withChars
      .filter((s) => (s.assertions.aboveFoldChars ?? 0) < LOW_CONTENT_CHARS)
      .map((s) => ({ name: s.name, aboveFoldChars: s.assertions.aboveFoldChars, contentTopPx: s.assertions.contentTopPx ?? null }))
      .sort((a, b) => (a.aboveFoldChars ?? 0) - (b.aboveFoldChars ?? 0)),
    // Budgeted entries that matched an empty state. The spec hard-fails these, so a
    // non-empty list here means the run is already red — it is listed for the reader.
    budgetedOnEmptyState: states
      .filter((s) => s.assertions.contentBudgetPx != null && s.assertions.contentEmptyVia)
      .map((s) => ({ name: s.name, via: s.assertions.contentEmptyVia })),
    // The fattest surfaces: most chrome before the content. The standing worklist.
    mostChrome: states
      .filter((s) => typeof s.assertions.contentTopPx === 'number')
      .map((s) => ({ name: s.name, contentTopPx: s.assertions.contentTopPx as number, budgetPx: s.assertions.contentBudgetPx ?? null }))
      .sort((a, b) => b.contentTopPx - a.contentTopPx)
      .slice(0, 10),
  }

  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: states.length,
        failing: states.filter((s) => !s.pass).length,
        review,
        states,
      },
      null,
      2,
    ),
  )
  for (const f of frags) rmSync(join(dir, f))

  // Say it on the console too: a scheduled run's log is the only thing a human sees
  // when nothing failed, and "0 failing" is exactly when a silent lie survives.
  if (review.lowContent.length) {
    const names = review.lowContent.map((s) => `${s.name} (${s.aboveFoldChars})`).join(', ')
    console.log(`[matrix] ${review.lowContent.length} screen(s) under ${LOW_CONTENT_CHARS} chars above the fold — check the fixture, not just the number: ${names}`)
  }
}
