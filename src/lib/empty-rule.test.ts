import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, openTags } from './buildGuardScan'

// AN EMPTY MESSAGE IS AN EmptyState (solidify 2.3, 2026-11-05). COMPONENTS.md #1 folded
// ~45 lines onto <EmptyState> in June and left the per-context cells — a `<p
// className="cf__rels-empty mono">` beside a form, a `review__empty`, a
// `combobox__empty` — each with its own colour and margin, and each a step away from
// the copy contract (a section empty TEACHES; a cell is terse). `size="cell"` is the
// terse face; the eleven cells folded onto it, their seven one-rule CSS classes went.
//
// FAIL-CLOSED: a `<p>`, `<div>` or `<span>` whose className holds a token ending in
// `empty` (`x__empty`, `x-empty`, `empty`) fails — those are messages. A MODIFIER on a
// host (`now-card--supper-empty`, `routine-card__steps--empty`) is not a message, nor is
// a wrapper AROUND an EmptyState; each says so in ALLOWED. Planted red with
// ReviewChecklist's `<p className="review__empty">` restored.

const SRC = join(__dirname, '..')

const ALLOWED = new Map<string, string>([
  ['routines-empty', 'a WRAPPER div around the section’s <EmptyState> (grid placement)'],
  ['feed-empty', 'a WRAPPER div around Maison’s <EmptyState> + its hint line'],
  ['cercle-empty', 'the same wrapper’s second class'],
  ['addsheet__cook-empty', 'a WRAPPER div holding a label + the « choose a meal » button (not a message)'],
  ['cercle-fam__zone-empty', 'the drop-zone placeholder inside a chip row (« — » / « Dépose un visage ici ») — a span in a flex row, not a block message'],
  ['kitchen__day-sum-empty', 'an inline WORD (« À planifier ») in a grid cell’s summary line for a read-only viewer, not a block message'],
  ['routine-card__steps--empty', 'a MODIFIER on the steps strip (the draft chip + hint), not a message'],
  ['now-card--supper-empty', 'a MODIFIER on the hero card, not a message'],
  ['is-empty', 'a STATE class (is-*) on a field placeholder, not a message'],
])

const EMPTY_TOKEN = /(^|__|-)empty$/

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

function emptyTokensOf(tag: string): string[] {
  const m = /className=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/.exec(tag)
  if (!m) return []
  const value = m[1] ?? m[2] ?? m[3] ?? ''
  const lits = m[3] !== undefined ? [...value.matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]) : [value]
  return lits.flatMap((l) => l.trim().split(/\s+/)).filter((tok) => EMPTY_TOKEN.test(tok))
}

describe('empty rule — an empty message is an EmptyState', () => {
  it('the detector sees a hand-rolled cell (canary)', () => {
    expect(emptyTokensOf(`<p className="review__empty">`)).toEqual(['review__empty'])
    expect(emptyTokensOf(`<div className={'feed-empty' + x}>`)).toEqual(['feed-empty'])
    expect(emptyTokensOf(`<p className="empty-state empty-state--cell">`)).toEqual([])
  })

  it('no p/div/span carries an *empty class outside the listed modifiers and wrappers', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const el of ['p', 'div', 'span']) {
        for (const tag of openTags(f.raw, el)) {
          for (const tok of emptyTokensOf(tag)) {
            if (ALLOWED.has(tok)) continue
            offenders.push(`${f.path}: <${el} …${tok}…>`)
          }
        }
      }
    }
    expect(offenders, 'render <EmptyState size="cell"> (terse, no guide link) or <EmptyState> (a section: teaches in one line); a modifier or wrapper class goes in ALLOWED with the reason').toEqual([])
  })

  it('every ALLOWED token is still spelled (a stale entry exempts the next arrival)', () => {
    const live = new Set<string>()
    for (const f of files) for (const el of ['p', 'div', 'span']) for (const tag of openTags(f.raw, el)) for (const tok of emptyTokensOf(tag)) live.add(tok)
    const stale = [...ALLOWED.keys()].filter((t) => !live.has(t))
    expect(stale, 'drop these').toEqual([])
  })
})
