import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, classNameValues } from './buildGuardScan'

// A KIT CLASS BELONGS TO ITS PRIMITIVE (solidify 2.0, 2026-11-05). The recurring drift
// this repo's audits keep finding is the same markup spelled by hand beside the
// component that owns it: 23 copies of `<p className="loading mono">` next to
// `Loading`, eight copies of the avatar disc beside `Avatar`, `.chip` outside Chip (the
// rule chip-rule.test.ts already enforces, one token at a time). This guard is the
// general form: a class TOKEN with an owner may be spelled in a `className=` only by
// the file that owns it — anywhere else, reach for the component. Entries land wave by
// wave as each sweep closes (the token joins OWNED the commit its copies are gone).
//
// The reader is `classNameValues` (lib/buildGuardScan), lifted from chip-rule's — it
// walks `className=` VALUES only (the quoted literal, or the literals inside the
// braces), never prose or data: ARegler's `variant: 'chip' | 'card'`, DevKit's search
// keywords and a demo label all carry these words and are not classes.
//
// Fail-closed + ALLOWED(reason) per (token, file); stale entries fail. Planted red with
// the old `<p className="loading mono">` pasted back into MonthView.

const SRC = join(__dirname, '..')

// token → its owner file + what to reach for instead.
const OWNED = new Map<string, { owner: string; hint: string }>([
  ['loading', { owner: 'components/Fallback.tsx', hint: '<Loading> (or loadStateOf(q) when the wait is a query’s)' }],
])

// (token, file) → why this file may spell it. Empty today; an entry says what makes
// hosting the component impossible, not merely inconvenient.
const ALLOWED = new Map<string, string>([
  // (none today)
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

function spellings(token: string): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = []
  for (const f of files) for (const v of classNameValues(f.raw, token)) out.push({ file: f.path, line: v.line })
  return out
}

describe('kit class ownership — a primitive’s class is spelled by the primitive', () => {
  it('every owner still spells its own token (canary)', () => {
    for (const [token, { owner }] of OWNED) {
      expect(spellings(token).some((s) => s.file === owner), `${owner} no longer spells .${token}`).toBe(true)
    }
  })

  it('no owned token is spelled outside its owner', () => {
    const offenders: string[] = []
    for (const [token, { owner, hint }] of OWNED) {
      for (const s of spellings(token)) {
        if (s.file === owner || ALLOWED.has(`${token} @ ${s.file}`)) continue
        offenders.push(`${s.file}:${s.line} .${token} → use ${hint}`)
      }
    }
    expect(offenders, 'reach for the component; if hosting it is impossible, add `token @ file` to ALLOWED with the reason').toEqual([])
  })

  it('every ALLOWED entry still spells the token (a stale entry exempts the next arrival)', () => {
    const stale = [...ALLOWED.keys()].filter((k) => {
      const [token, file] = k.split(' @ ')
      return !spellings(token).some((s) => s.file === file)
    })
    expect(stale, 'drop these').toEqual([])
  })
})
