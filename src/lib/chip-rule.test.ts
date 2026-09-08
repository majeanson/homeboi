import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE CHIP RULE, made structural (sibling of write-rule.test.ts / intl-rule.test.ts
// — same fail-closed shape, same shared plumbing).
//
// `components/Chip.tsx` is THE chip. The class `.chip` is its markup, so spelling
// that class by hand anywhere else means a second chip exists — and the second one
// always drifts on the part you cannot see. It did: the 2026-09-08 DevKit ↔ code
// audit found 18 hand-rolled `.chip` sites, and what they had in common was that
// the primitive could not SAY what they were — an action that does something, a
// chip that navigates, a read-only label, a row that unfolds a panel. Everything
// that wasn't a toggle stayed outside, and the primitive's own `aria-pressed` was
// then wrong for the 10 action chips that HAD gone through it ("Balayer, toggle
// button, not pressed" — for ever, on a chip that only fills a field).
//
// Chip now carries all five shapes (toggle · action · link · static · expander),
// so a hand-rolled `.chip` is a fork, not a workaround. FAIL-CLOSED: a className
// holding the bare token `chip` may only appear in an ALLOWED entry below, and the
// entry has to say why the primitive cannot host that call site. (`chip--toggle`,
// `cnote__chip`, `sky-wx__chip` are different classes and are not matched — only
// the standalone token. Chip.tsx itself never trips it: it composes its class from
// a local, so there is no `className="chip …"` to find.)

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

// file (repo-relative, /-separated) → why the bare `chip` class is spelled there.
// Empty on purpose: every call site fits one of Chip's five shapes today.
const ALLOWED = new Map<string, string>([])

interface Site {
  file: string
  line: number
  text: string
}

// Every `className=` VALUE holding the bare class `chip`. A className is written
// either as one literal (className="chip mono") or by concatenation
// (className={'chip' + (on ? ' is-on' : '')}), so the scan takes the value — the
// quoted string, or everything inside the braces — and looks at the literals in it.
//
// Scanning EVERY string literal instead (the first shape this took) reads the word
// out of prose and data: ARegler's `variant?: 'chip' | 'card'` union, DevKit's
// search keywords, a demo label with the word "chip" in it. A class rule has to
// look at classes — verified below against a fixture holding both.
export function chipClassNames(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  for (const m of src.matchAll(/className=/g)) {
    const at = (m.index ?? 0) + m[0].length
    let value: string
    if (src[at] === '{') {
      // Balanced-brace read: a className expression can hold nested braces (a
      // template literal's `${…}`, a ternary over an object lookup).
      let depth = 0
      let i = at
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}' && --depth === 0) break
      }
      value = src.slice(at, i + 1)
    } else {
      value = src.slice(at).match(/^(['"])[^'"\n]*\1/)?.[0] ?? ''
    }
    const holdsChip = [...value.matchAll(/(['"`])([^'"`\n]*)\1/g)].some((lit) =>
      lit[2].trim().split(/\s+/).includes('chip'),
    )
    if (holdsChip) out.push({ line: src.slice(0, m.index).split('\n').length, text: value.slice(0, 60) })
  }
  return out
}

function handRolledChips(): Site[] {
  const out: Site[] = []
  for (const f of sourceFiles(srcDir)) {
    if (!f.endsWith('.tsx')) continue
    const file = relative(rootDir, f).split(sep).join('/')
    for (const hit of chipClassNames(readScanned(f))) out.push({ file, ...hit })
  }
  return out
}

describe('the chip rule (the .chip class belongs to Chip.tsx, nowhere else)', () => {
  // The canary. A grep guard that has never been red proves nothing, and this one
  // asserts an ABSENCE across the tree — so the detector is pinned against a
  // fixture carrying both a real violation and the three near-misses that made the
  // first version of this scan cry wolf.
  it('the detector sees a hand-rolled chip and none of its look-alikes', () => {
    const fixture = [
      `<span className="chip mono">x</span>`, // ← the violation (line 1)
      `<b className={'chip' + (on ? ' is-on' : '')}>y</b>`, // ← and its built form (line 2)
      `<Chip className="chip--toggle">z</Chip>`,
      `<i className="cnote__chip sky-wx__chip">w</i>`,
      `const variant: 'chip' | 'card' = 'chip'`,
      `<Demo label="tucks a chip group away" kw="chip tag pill" />`,
    ].join('\n')
    expect(chipClassNames(fixture).map((h) => h.line)).toEqual([1, 2])
  })

  it('no hand-rolled .chip outside the primitive', () => {
    const offenders = handRolledChips()
      .filter((s) => !ALLOWED.has(s.file))
      .map((s) => `${s.file}:${s.line} ${s.text}`)
    expect(
      offenders,
      'use <Chip> — it carries all five shapes (selected = toggle · onClick = action · to = link · neither = static label · expanded = unfolds a panel). If a call site truly cannot use it, EXTEND the primitive rather than forking the class; an ALLOWED entry has to say why hosting it is impossible',
    ).toEqual([])
  })

  it('every ALLOWED file still spells it (a stale entry exempts the next arrival)', () => {
    const live = new Set(handRolledChips().map((s) => s.file))
    const dead = [...ALLOWED.keys()].filter((f) => !live.has(f))
    expect(dead, 'these files no longer spell the chip class — drop them from ALLOWED').toEqual([])
  })
})
