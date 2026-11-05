import { readFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// THE NAME SAYS THE SHELL (solidify 3.5, 2026-11-05). A `*Sheet` slides up from the
// bottom on <Sheet>; a `*Dialog` / `*Modal` is centred on <Modal>. The ask, Flipp and
// empty-fridge dialogs were centred but named *Sheet, and the recipe view was a
// routed scene. Files renamed (CSS classes untouched). Planted red by renaming the ask
// dialog back to its old name.

const SRC = join(__dirname, '..', 'components')

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), name: basename(f, '.tsx'), raw: blankComments(readFileSync(f, 'utf8')) }))

describe('overlay naming — the name says the shell', () => {
  it('the scan found the shells (canary)', () => {
    expect(files.some((f) => f.name === 'AddSheet')).toBe(true)
    expect(files.some((f) => f.name === 'AskDialog')).toBe(true)
  })

  it('a *Sheet renders <Sheet>', () => {
    const bad = files.filter((f) => /Sheet$/.test(f.name) && f.name !== 'Sheet' && !/<Sheet\b/.test(f.raw)).map((f) => f.path)
    expect(bad, 'centred → rename *Dialog and render <Modal>; a routed page → *Scene').toEqual([])
  })

  it('a *Dialog / *Modal renders <Modal> (or a *Modal that does)', () => {
    const bad = files.filter((f) => /(Dialog|Modal)$/.test(f.name) && f.name !== 'Modal' && !/<\w*Modal\b/.test(f.raw)).map((f) => f.path)
    expect(bad).toEqual([])
  })
})
