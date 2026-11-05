import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// ONE SPELLING FOR A .btn (solidify 2.6, 2026-11-05). The same button read
// `btn btn--ghost btn--sm` in 27 places and `btn btn--sm btn--ghost` in 22 — and a grep
// for either found half of them. The canonical order, by what each token DOES:
//
//   btn  →  tone (btn--primary | btn--ghost | btn--danger)  →  size (btn--sm)
//        →  layout (btn--block | btn--icon | btn--bare)  →  mono  →  the page's classes
//
// This reads every className literal whose first token is `btn` (a quoted literal, or
// the first literal of a concatenation / template) and fails one whose tokens come in
// another order; the 328 buttons on OTHER families (bigtile, act, chip, deck…) are not
// forced here — only the family's own literal is. The number of DISTINCT `btn…`
// literals is a ratchet: it may fall (a sweep folds spellings), never rise.
// Planted red with `btn mono btn--ghost` in one file.

const SRC = join(__dirname, '..')

const RANK: Record<string, number> = {
  btn: 0,
  'btn--primary': 1,
  'btn--ghost': 1,
  'btn--danger': 1,
  'btn--sm': 2,
  'btn--block': 3,
  'btn--icon': 3,
  'btn--bare': 3,
  mono: 4,
}
const rank = (tok: string) => RANK[tok] ?? 5

// Distinct `btn…` literals (quoted + the first literal of a concatenation/template) the
// day the sweep landed: 93 before the three folds, 92 after.
const DISTINCT_MAX = 92

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

// Every className literal that starts with the `btn` token — quoted, or the first
// literal inside the braces.
export function btnLiterals(src: string): { line: number; lit: string }[] {
  const out: { line: number; lit: string }[] = []
  for (const m of src.matchAll(/className=(?:"(btn(?:\s[^"]*)?)"|\{\s*(?:'(btn(?:\s[^']*)?)'|`(btn(?:\s[^`$]*)?)))/g)) {
    const lit = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (lit) out.push({ line: src.slice(0, m.index).split('\n').length, lit })
  }
  return out
}

export function outOfOrder(lit: string): boolean {
  const toks = lit.split(/\s+/)
  let last = -1
  for (const t of toks) {
    const r = rank(t)
    if (r < last) return true
    // two page classes may follow each other; two tone tokens may not
    if (r === last && r !== 5) return true
    last = r
  }
  return false
}

describe('btn order — one spelling for the button family', () => {
  it('the reader sees the literal, the concatenation and the template; the order rule holds (canary)', () => {
    const src = [
      `<button className="btn btn--ghost btn--sm mono x__y">`,
      `<button className={'btn btn--sm btn--ghost' + (on ? ' is-on' : '')}>`,
      `<button className={\`btn btn--ghost\${on ? ' is-on' : ''}\`}>`,
      `<span className="chip btn--ghost">`,
    ].join('\n')
    expect(btnLiterals(src).map((b) => b.lit)).toEqual(['btn btn--ghost btn--sm mono x__y', 'btn btn--sm btn--ghost', 'btn btn--ghost'])
    expect(outOfOrder('btn btn--ghost btn--sm mono x__y')).toBe(false)
    expect(outOfOrder('btn btn--sm btn--ghost')).toBe(true)
    expect(outOfOrder('btn mono btn--ghost')).toBe(true)
    expect(outOfOrder('btn x__y mono')).toBe(true)
    expect(outOfOrder('btn btn--primary btn--sm help-pick')).toBe(false)
  })

  it('every btn literal follows btn → tone → size → layout → mono → page classes', () => {
    const offenders = files.flatMap((f) => btnLiterals(f.raw).filter((b) => outOfOrder(b.lit)).map((b) => `${f.path}:${b.line} "${b.lit}"`))
    expect(offenders, 'reorder: btn, then btn--primary|ghost|danger, then btn--sm, then btn--block|icon|bare, then mono, then the page classes').toEqual([])
  })

  it('distinct btn literals only ever get fewer (ratchet)', () => {
    const distinct = new Set(files.flatMap((f) => btnLiterals(f.raw).map((b) => b.lit)))
    expect(distinct.size, `distinct btn literals: ${distinct.size} (max ${DISTINCT_MAX}) — a new spelling is a page class the button did not need, or a fold waiting to happen`).toBeLessThanOrEqual(DISTINCT_MAX)
    expect(distinct.size, 'the ratchet is loose — lower DISTINCT_MAX to the current count').toBeGreaterThan(DISTINCT_MAX - 10)
  })
})
