import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, openTags } from './buildGuardScan'

// A SEARCH BOX IS A SearchField (solidify 2.4, 2026-11-05). Five surfaces drew their
// own: two `<input type="search">` (the emoji picker, the guide) and three bare
// `<input className="input">` with an Enter handler or an `enterKeyHint="search"` (the
// circulaires search form, the quick-add scene, the search scene) — each a different
// width, border and keyboard. `SearchField` carries the magnifier, the ✕, Escape, the
// collapsible face, and now `size="sm"` and `onSubmit` (Enter asks, the keyboard says
// « rechercher »). All five folded onto it.
//
// FAIL-CLOSED: a raw `<input>` with `type="search"` or `enterKeyHint="search"` outside
// the two field primitives fails. Planted red with the emoji picker's input restored.

const SRC = join(__dirname, '..')

const OWNERS = new Set(['components/SearchField.tsx', 'components/EditField.tsx'])

const ALLOWED = new Map<string, string>([
  // (none today)
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

const isSearchInput = (tag: string) => /type=["']search["']|enterKeyHint=["']search["']/.test(tag)

describe('search rule — a search box is a SearchField', () => {
  it('the detector sees a raw search input (canary)', () => {
    expect(openTags(`<input className="input" type="search" value={q} />`, 'input').some(isSearchInput)).toBe(true)
    expect(openTags(`<input className="input" value={q} enterKeyHint="search" />`, 'input').some(isSearchInput)).toBe(true)
    expect(openTags(`<input className="input" type="text" />`, 'input').some(isSearchInput)).toBe(false)
  })

  it('no raw search input outside SearchField / EditField', () => {
    const offenders = files
      .filter((f) => !OWNERS.has(f.path) && !ALLOWED.has(f.path))
      .flatMap((f) => openTags(f.raw, 'input').filter(isSearchInput).map(() => f.path))
    expect(offenders, 'render <SearchField value onChange ariaLabel placeholder size? onSubmit? collapsible? /> — it carries the magnifier, the ✕, Escape and the keyboard hint').toEqual([])
  })

  it('every ALLOWED file still carries a raw search input (a stale entry exempts the next arrival)', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = [...ALLOWED.keys()].filter((p) => !byPath.has(p) || !openTags(byPath.get(p)!, 'input').some(isSearchInput))
    expect(stale).toEqual([])
  })
})
