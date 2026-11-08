import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE EFFORT (0149, plans/2026-11-06-TACHE-UNIFIEE.md phase 3b). Five dots, 1 to 5, null = not
// said. Two ways it would drift, each held here:
//
//   · THE WRITE. Every handler takes the body's `effort` through ONE door, `taskEffort`
//     (functions/_lib/validate.ts): an integer from 1 to 5, anything else null. A handler that
//     binds `body.effort` raw would store a 7, a '3' or a 2.5, and the finder's « this effort
//     and below » would quietly start lying. Only the « was it sent? » test may read it bare.
//   · THE CONTROL. EffortDots is the only effort picker, and the dot WORDS (« Tout simple » …
//     « Gros effort ») live in it: a screen that reads `t.effort.levels` or `t.effort.dot` is
//     spelling its own dots, the way the colour row nearly grew five shapes before LookPicker.
//     Other screens ask EffortDots.tsx for a name (`useEffortName`). The dot CLASSES are held
//     by kit-class-rule (`effort-dots`, `effort-dots__dot`, `effort-mark`).
//
// Planted red twice (2026-11-08): `binds.push(body.effort)` in chores.ts's PATCH, and a
// `t.effort.levels[2]` read in TaskList.tsx (the first try at that plant missed its line and
// stayed green; grep showed it had not landed).

const ROOT = join(__dirname, '..', '..')
const API = join(ROOT, 'functions', 'api')
const SRC = join(ROOT, 'src')

const read = (dir: string, keep: (f: string) => boolean) =>
  sourceFiles(dir)
    .filter(keep)
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .map((f) => ({ path: relative(ROOT, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

// Every bare read of the body's effort that is neither the argument of taskEffort( nor the
// « was it sent? » test.
function rawEffortReads(src: string): number[] {
  const out: number[] = []
  const re = /\bbody\??\.effort\b/g
  for (const m of src.matchAll(re)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index)
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 16)
    if (/taskEffort\($/.test(before)) continue
    if (/^\s*[!=]==?\s*undefined/.test(after)) continue
    out.push(src.slice(0, m.index).split('\n').length)
  }
  return out
}

const WORDS = /\bt\.effort\.(levels|dot)\b/

describe('effort rule — one door to write it, one control to pick it', () => {
  it('the detectors see a raw bind and a hand-spelled dot word (canary)', () => {
    expect(rawEffortReads('binds.push(body.effort)')).toEqual([1])
    expect(rawEffortReads('x\ntaskEffort(body?.effort), y')).toEqual([])
    expect(rawEffortReads('if (body.effort !== undefined) {')).toEqual([])
    expect(rawEffortReads('body?.effort === undefined')).toEqual([])
    expect(WORDS.test('const w = t.effort.levels[2]')).toBe(true)
    expect(WORDS.test('t.effort.finder')).toBe(false)
  })

  const handlers = read(API, (f) => f.endsWith('.ts'))

  it('the handlers the rule exists for are read', () => {
    const touching = handlers.filter((f) => /\bbody\??\.effort\b/.test(f.raw)).map((f) => f.path)
    expect(touching).toEqual(expect.arrayContaining(['functions/api/chores.ts', 'functions/api/home-projects.ts', 'functions/api/todos.ts']))
  })

  it('every handler takes the body’s effort through taskEffort', () => {
    const offenders = handlers.flatMap((f) => rawEffortReads(f.raw).map((line) => `${f.path}:${line}`))
    expect(offenders, 'bind taskEffort(body.effort) (functions/_lib/validate.ts): 1 to 5, anything else null').toEqual([])
  })

  it('the dot words are read only by EffortDots.tsx', () => {
    const offenders = read(SRC, (f) => /\.tsx?$/.test(f))
      .filter((f) => f.path !== 'src/components/EffortDots.tsx' && WORDS.test(f.raw))
      .map((f) => f.path)
    expect(offenders, 'render <EffortDots>/<EffortField>/<EffortMark>, or ask useEffortName() for the word').toEqual([])
  })
})
