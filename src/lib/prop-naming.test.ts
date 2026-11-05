import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE WORD FOR ONE GESTURE (solidify 3.7, 2026-11-05). Leaving a surface is `onClose`;
// choosing is `onSelect`. `onBack`, `onDismiss` and `onPick` meant the same thing in
// different files; a component for the toddler lens is `Toddler*` (the audience is
// called toddler everywhere else; routes stay frozen). Planted red with `onPick:` back
// on SkySheet's props.

const SRC = join(__dirname, '..')
const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

const BAD_PROP = /^\s+(onDismiss|onDone|onBack|onPick)\??:\s*\(/m

describe('prop naming — one word for one gesture', () => {
  it('the detector sees a prop type and not an object key (canary)', () => {
    expect(BAD_PROP.test('  onPick: (s: string) => void')).toBe(true)
    expect(BAD_PROP.test('  onBack?: () => void')).toBe(true)
    expect(BAD_PROP.test('  onDone: ro ? undefined : () => x()')).toBe(false)
  })

  it('no prop is named onDismiss / onDone / onBack / onPick', () => {
    const offenders = files.filter((f) => BAD_PROP.test(f.raw)).map((f) => `${f.path}: ${BAD_PROP.exec(f.raw)![1]}`)
    expect(offenders, 'leaving a surface is onClose, choosing is onSelect; anything else gets a name that says what it does').toEqual([])
  })

  it('no exported component is named Kid*', () => {
    const offenders = files.filter((f) => /export (?:function|const) Kid[A-Z]/.test(f.raw)).map((f) => f.path)
    expect(offenders, 'Toddler* — the lens is the toddler lens').toEqual([])
  })
})
