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

// …and the screens ALREADY understood to be sparse, with why. Reviewed 2026-08-26 by
// opening every one of the 16 the flag first raised: none was a lean gap.
//
// This list is the difference between a signal and noise. A flag that fires 16 times
// every single run gets scrolled past within a month — the same way aboveFoldChars
// sat unread in the manifest while /notes was being measured on an empty page. So the
// console names only the UNEXPLAINED ones; the rest are counted and kept in the
// manifest. Adding a line here is a VERDICT: you opened the PNG and it is sparse by
// design. Never add one to quieten something you have not looked at.
const LOW_CONTENT_EXPECTED: { match: RegExp; why: string }[] = [
  { match: /-toddler(-|$)/, why: 'toddler lens — big picture cards and audio, almost no text by design' },
  { match: /^first-/, why: 'the first-run walk — these fixtures are deliberately empty' },
  { match: /^note-editor/, why: 'a blank writing surface: toolbar + placeholder is all there is before you type' },
  { match: /^kitchen-ideas/, why: 'the Idées drawer holds 2 ideas in the fixture; no budget on this entry (report-only)' },
  { match: /^form-/, why: 'a form is fields, not prose — its first field sits at ~17px' },
  { match: /^maison-carnets/, why: 'seeded with 2 carnet rows on purpose — enough to measure the row rhythm' },
  // Reviewed 2026-08-26, the batch of scenes the sweep had never opened. Every PNG
  // below was opened before its line was written here.
  { match: /^routine-run/, why: 'the routine PLAYER — one big picture card for a pre-reader; the empty space IS the design (no budget)' },
  { match: /^recipe-book/, why: '« Mon livre de cuisine » is a picture book COVER you turn, not a list (no budget)' },
  { match: /^cashier/, why: 'the till surface centres its tiles; the shared list fixture stages exactly one deal (no budget)' },
  { match: /^drawings/, why: 'a wall of drawings — two images and their dates; images carry no characters' },
  { match: /^jouer/, why: '« Jouer » is a menu of four big doors, one word each' },
  { match: /^quickadd/, why: '« Ajout rapide » is five short item names — that IS the surface' },
  { match: /^circulaires/, why: 'measured on « Par magasin »: three flyer rows, a logo + a date range each' },
]
const explain = (name: string) => LOW_CONTENT_EXPECTED.find((r) => r.match.test(name))?.why ?? null

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
      .map((s) => ({
        name: s.name,
        aboveFoldChars: s.assertions.aboveFoldChars,
        contentTopPx: s.assertions.contentTopPx ?? null,
        // null = nobody has looked at this one yet. That is the whole signal.
        expected: explain(s.name),
      }))
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
  const unexplained = review.lowContent.filter((s) => !s.expected)
  if (unexplained.length) {
    const names = unexplained.map((s) => `${s.name} (${s.aboveFoldChars})`).join(', ')
    console.log(
      `[matrix] ${unexplained.length} NEW screen(s) under ${LOW_CONTENT_CHARS} chars above the fold — ` +
        `open the PNG and decide: sparse by design, or an empty fixture making its budget a lie? ${names}`,
    )
  } else if (review.lowContent.length) {
    console.log(`[matrix] ${review.lowContent.length} sparse screen(s), all previously reviewed — nothing new to look at.`)
  }
}
