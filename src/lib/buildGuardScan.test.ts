import { describe, it, expect } from 'vitest'
import { blankComments, openTags, arrayStrings } from './buildGuardScan'

// THE SCANNERS THEMSELVES, pinned against the traps that fooled them.
//
// Every fail-closed guard in this repo is a scan plus an assertion, and the scan is
// the half that fails silently: a walk over the wrong shape reports the wrong thing
// with total confidence, and nobody re-reads a green test. Three of them did exactly
// that (see the block above `openTags` in buildGuardScan.ts), so the shapes live in
// one module now — and this file is what makes trusting that module reasonable.
//
// Each case below is a REAL trap, not a hypothetical: the JSX one is the shape that
// makes a slice-to-first-`>` lie, and the array one is the comment placement that made
// docCounts read 29 where the truth was 39 (2026-09-10).

describe('openTags — the tag ends where the BRACES say, not at the first >', () => {
  it('reads a tag whose attributes contain > and a nested element', () => {
    const src = `
      <OperatorSection
        title={t.x}
        action={<button onClick={() => go('a')}>{'>'}</button>}
        helpKey="demo"
      >
        <p>the body, which is NOT part of the open tag</p>
      </OperatorSection>`
    const tags = openTags(src, 'OperatorSection')
    expect(tags).toHaveLength(1)
    expect(tags[0]).toContain('helpKey="demo"')
    expect(tags[0]).not.toContain('the body')
  })

  it('finds every occurrence, and stops at each one', () => {
    const src = `<Chip a={1}>one</Chip>\n<Chip b={() => 2}>two</Chip>`
    expect(openTags(src, 'Chip')).toEqual(['<Chip a={1}>', '<Chip b={() => 2}>'])
  })

  it('does not match a LONGER name that merely starts the same', () => {
    // `<ChipGroup>` is not a `<Chip>`; a scan that ignores this counts a container
    // as one of the things it contains.
    const src = `<ChipGroup><Chip x="1">a</Chip></ChipGroup>`
    const chips = openTags(src, 'Chip')
    expect(chips.filter((t) => t.startsWith('<ChipGroup'))).toEqual([])
  })

  it('returns nothing rather than guessing when the tag is absent', () => {
    expect(openTags('<div />', 'Nope')).toEqual([])
  })
})

describe('arrayStrings — a commented item still counts', () => {
  it('reads items that sit under a line comment', () => {
    const src = `
const NAMES = [
  // the first group — this comment sits directly above a name
  'alpha', 'beta',
  // and this one above two more
  'gamma',
  'delta',
]`
    // The bug: splitting on commas glues « // and this one above two more\n'gamma' »
    // into one chunk that no longer starts with a quote, so 'alpha' and 'gamma' both
    // vanish. This read 2 of 4 before comments were blanked first.
    expect(arrayStrings(src, 'NAMES')).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })

  it('ignores a quoted string inside a comment', () => {
    const src = `
const NAMES = [
  // renamed from 'ghost' on 2026-01-01
  'real',
]`
    expect(arrayStrings(src, 'NAMES')).toEqual(['real'])
  })

  it('handles both quote styles and an empty array', () => {
    expect(arrayStrings(`const A = ['x', "y"]`, 'A')).toEqual(['x', 'y'])
    expect(arrayStrings(`const A = []`, 'A')).toEqual([])
  })

  it('throws rather than returning [] when the const is gone', () => {
    // Silence here would read as "zero items" — a renamed const would quietly zero a
    // ratchet instead of failing loudly.
    expect(() => arrayStrings('const OTHER = []', 'MISSING')).toThrow(/MISSING/)
  })
})

describe('blankComments keeps line numbers, which is why reports stay clickable', () => {
  it('replaces a block comment with newlines, not with nothing', () => {
    const src = 'const a = 1\n/* two\n   lines */\nconst b = 2'
    const out = blankComments(src)
    expect(out.split('\n')).toHaveLength(src.split('\n').length)
    expect(out).toContain('const b = 2')
  })
})
