import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bucketByDay, type MonthData } from '../components/board/dayLines'

// THE TWO FACES OF A DAY MUST AGREE.
//
// `dayLines.linesFor` is "everything on this day, as markers" — the month's grid cell
// and « La semaine »'s row both draw it. MonthView's day PANEL is a second walk over
// the same bucket, because it renders real `<Act>` rows with peeks and actions rather
// than glyphs. Two walks over one bucket is the drift this whole module was extracted
// to prevent, and it drifted within a day: « Les calendriers » (since retired, 0132)
// was added to `linesFor` and not to the panel, so a day holding only a feed
// occurrence drew a dot in the grid and said « rien ce jour-là » underneath — and the
// guard then found « Les virements » had had the same hole since 0126.
//
// The panel cannot be unified with `linesFor` — a marker is a colour and a shape, a
// panel row is a component with a peek — so instead this pins the one thing that must
// hold: **every bucket list `linesFor` reads, the panel reads too.** A new dated kind
// added to one and not the other fails here.

const SRC = readFileSync(join(__dirname, '..', 'components', 'board', 'MonthView.tsx'), 'utf8')

/** The DayBucket fields `linesFor` walks, discovered by running it on a bucket whose
 *  every list is non-empty — so this can never fall out of date with the real walk. */
function fieldsLinesForReads(): string[] {
  const day = 1_760_000_000
  const one = <T,>(x: T) => [x]
  const data = {
    events: one({ id: 'e', title: 'E', at: day, all_day: 1, member_id: null, day }),
    meals: one({ id: 'm', slot: 'supper', title: 'M', cook_member_id: null, day }),
    chores: one({ id: 'c', title: 'C', color: null, who: null, day }),
    dayNotes: one({ id: 'n', text: 'N', member_id: null, day }),
    todos: one({ id: 't', title: 'T', member_id: null, day, section: null }),
    homeProjects: one({ id: 'h', kind: 'upkeep', title: 'H', color: null, day }),
    habits: one({ id: 'hb', habit_id: 'hb', title: 'HB', icon: '', colour: null, kind: 'do', member_id: null, day, done: true }),
    transfers: one({ id: 'tr', planId: 'p', title: 'TR', colour: null, day }),
  } as unknown as MonthData
  const bucket = bucketByDay(data, null)
  const b = bucket.get(day)
  expect(b, 'the bucket must hold the seeded day').toBeTruthy()
  // Which lists ended up non-empty IS the set of kinds the payload can carry.
  return Object.entries(b as unknown as Record<string, unknown[]>)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k]) => k)
}

describe('the day panel and the day markers read the same bucket', () => {
  it('linesFor emits a line for every kind the bucket can hold', () => {
    const day = 1_760_000_000
    const fields = fieldsLinesForReads()
    // Eight kinds seeded, eight lists filled — if a future payload key stops bucketing,
    // this is where it shows.
    expect(fields.sort()).toEqual(['chores', 'events', 'habits', 'home', 'meals', 'notes', 'todos', 'transfers'])
    expect(day).toBeGreaterThan(0)
  })

  it('MonthView\u2019s day panel reads every one of those lists', () => {
    // `dayRows` builds the panel's rows from the bucket; each kind appears as a
    // `b?.<field>` read. A kind in the bucket with no read here is a kind that draws a
    // dot in the cell and vanishes from the words underneath.
    const missing = fieldsLinesForReads().filter((f) => !SRC.includes(`b?.${f}`))
    expect(
      missing,
      `MonthView.dayRows never reads these bucket lists, so a day holding only one of ` +
        `them draws a marker in the grid and reads as empty in the panel: ${missing.join(', ')}. ` +
        `Add a row for it in dayRows (and count it in selCount).`,
    ).toEqual([])
  })

  it('\u2026and counts every one of them in selCount, which gates the empty state', () => {
    // The count and the rows are separate expressions, so they can disagree in either
    // direction: rows with no count reads as « rien ce jour-là » ABOVE a list of
    // things; a count with no rows prints an empty panel that claims not to be.
    const m = /const selCount =([\s\S]*?)\n\n/.exec(SRC)
    expect(m, 'selCount must still be a single expression this test can read').toBeTruthy()
    const expr = m![1]
    const missing = fieldsLinesForReads().filter((f) => {
      // The panel filters some lists before counting them (meals by visible slot,
      // todos by pending, habits by done) and counts the filtered local instead.
      const aliases = [`sel.${f}.length`, `sel${f[0].toUpperCase()}${f.slice(1)}.length`]
      if (f === 'habits') aliases.push('selHabitsDone.length')
      if (f === 'home') aliases.push('sel.home.length')
      return !aliases.some((a) => expr.includes(a))
    })
    expect(
      missing,
      `selCount does not count these, so a day holding only one of them shows the ` +
        `empty state with rows underneath it: ${missing.join(', ')}`,
    ).toEqual([])
  })
})
