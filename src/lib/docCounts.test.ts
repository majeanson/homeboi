import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Numbers written in prose go stale silently, and a stale number is worse than no
// number: it is read as current. PARITY.md said « 6 tours » and « 7 registries » for
// weeks after a 7th tour and an 8th registry shipped, and « 32 guide cards » while
// 34 existed — in THREE documents, one of which contradicted itself (DISCOVERY.md
// said 34 on one line and 32 on another). One of the stale copies was written by the
// very pass that was correcting the others.
//
// So the counts are asserted from code. If you add a tour, a registry or a guide
// card, this test names every document that now lies about it.
//
// A missing claim FAILS rather than skips. A doc that quietly reworded its way out of
// the check would otherwise look green forever, which is the exact failure mode this
// whole family of guards exists to kill.
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const guideCards = () => {
  const s = read('src/lib/guideContent.ts')
  const body = s.slice(s.indexOf('export const GUIDE'))
  return new Set([...body.matchAll(/^ {4}id: '([a-z0-9-]+)'/gm)].map((m) => m[1])).size
}
const tours = () => new Set([...read('src/lib/tourContent.ts').matchAll(/^ {4}id: '([a-z-]+)',$/gm)].map((m) => m[1])).size
const registries = () => readdirSync(join(ROOT, 'src', 'lib')).filter((f) => f.endsWith('Help.ts')).length
// The state matrix, parsed from its own table. Two traps, both hit while writing this,
// and both of the kind that report a confident wrong number rather than throwing:
// the array is declared `Entry[] = [`, so anchoring on `indexOf('[')` lands on the
// TYPE's brackets and reads an empty body (it said 0 entries, twice); and three entries
// span several lines, so a per-line count is short by exactly those three. Hence: strip
// line comments, anchor on `= [`, then walk brace depth.
const matrixEntries = (): { entries: number; states: number; budgetedStates: number } => {
  const src = read('e2e/state-matrix.spec.ts')
  const raw = src
    .slice(src.indexOf('const MATRIX: Entry[] = ['))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
  const open = raw.indexOf('= [') + 2
  let d = 0
  let end = -1
  for (let i = open; i < raw.length; i++) {
    const c = raw[i]
    if (c === '[') d++
    else if (c === ']') {
      d--
      if (!d) {
        end = i
        break
      }
    }
  }
  const objs: string[] = []
  let depth = 0
  let cur = ''
  for (const c of raw.slice(open + 1, end)) {
    if (c === '{') depth++
    if (depth > 0) cur += c
    if (c === '}') {
      depth--
      if (!depth) {
        objs.push(cur)
        cur = ''
      }
    }
  }
  // An entry pinned to one theme photographs once; every other entry runs day AND night.
  const width = (o: string) => (/themes: \['(day|night)'\]/.test(o) ? 1 : 2)
  return {
    entries: objs.length,
    states: objs.reduce((n, o) => n + width(o), 0),
    budgetedStates: objs.reduce((n, o) => n + (/budgetPx:/.test(o) ? width(o) : 0), 0),
  }
}
// A ledger's headline, counted from its own boxes. `- [ ]` means exactly one thing
// repo-wide (STATE.md §2), which is what makes this countable at all.
const openBoxes = (file: string) => (read(file).match(/^\s*- \[ \] /gm) ?? []).length
// Every root ledger's open work, summed. Anchored at line start ON PURPOSE: STATE.md
// quotes the grep command `- [ ] ` inside its own prose, and a substring count reads
// that as a third open item — the counter counting its own documentation.
const rootOpenBoxes = () => {
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.md'))
  const per = files.map((f) => [f, openBoxes(f)] as const).filter(([, n]) => n > 0)
  return { total: per.reduce((n, [, c]) => n + c, 0), per }
}

// The term table (UNIFY.md day 1). Its size is quoted in UNIFY.md's census; a census
// number that drifts from the data is the very thing this week exists to stop.
const glossaryTerms = () => new Set([...read('src/lib/glossary.ts').matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1])).size

describe('the docs quote the real counts', () => {
  // Each claim: the file, a regex whose FIRST capture group is the number as written,
  // and the live value it must equal. Keep the regex tight enough that it only matches
  // the sentence it is meant to check.
  const claims: { file: string; what: string; re: RegExp; actual: () => number }[] = [
    { file: 'PARITY.md', what: 'help registries (D7 method)', re: /coverage by one of the \*\*(\d+)\*\* help registries/, actual: registries },
    { file: 'PARITY.md', what: 'tours (D7 method)', re: /`lib\/tourContent\.ts`, \*\*(\d+)\*\* tours/, actual: tours },
    { file: 'PARITY.md', what: 'guide cards (Appendix A)', re: /`src\/lib\/guideContent\.ts` \(\*\*(\d+)\*\* GUIDE cards\)/, actual: guideCards },
    { file: 'PARITY.md', what: 'tours (Appendix A)', re: /\(\*\*(\d+)\*\* tours: essentials/, actual: tours },
    { file: 'CLAUDE.md', what: 'guide cards (jargon table)', re: /\*\*(\d+)\*\* guide cards today against/, actual: guideCards },
    { file: 'UNIFY.md', what: 'glossary terms (census)', re: /glossary \*\*(\d+)\*\* terms/, actual: glossaryTerms },
    { file: 'STATE.md', what: 'glossary terms (§3 week summary)', re: /`src\/lib\/glossary\.ts` holds \*\*(\d+)\*\* terms/, actual: glossaryTerms },
    { file: 'DISCOVERY.md', what: 'guide cards (add-a-feature step 1)', re: /there\s+are \*\*(\d+)\*\* today/, actual: guideCards },
    // A ledger's own banner, against its own boxes (UNIFY.md day 7). This one had said
    // « 15 » for twelve days after the boxes fell to 1 — and STATE.md had it right the
    // whole time. The headline is the part everyone reads and nobody re-derives.
    { file: 'REVIEW-PASS.md', what: 'its own open findings', re: /\*\*(\d+) findings? still open here\*\*/, actual: () => openBoxes('REVIEW-PASS.md') },
    // LEAN.md keeps the FIRST sweep's numbers as dated history; these are the live ones.
    { file: 'LEAN.md', what: 'matrix entries (current size)', re: /today the sweep is (\d+) entries/, actual: () => matrixEntries().entries },
    { file: 'LEAN.md', what: 'matrix states (current size)', re: /entries → (\d+)\s*\n?states/, actual: () => matrixEntries().states },
    { file: 'LEAN.md', what: 'budgeted states (current size)', re: /states, (\d+) of them budgeted/, actual: () => matrixEntries().budgetedStates },
    // STATE.md §2's headline: the repo's entire written open work, in one number. It is
    // the first thing a session reads, so it is the worst one to let drift.
    { file: 'STATE.md', what: 'repo-wide open boxes', re: /It reads \*\*(\d+)\*\* \(\d+ in `REVIEW-PASS/, actual: () => rootOpenBoxes().total },
    { file: 'STATE.md', what: 'open boxes in REVIEW-PASS.md', re: /It reads \*\*\d+\*\* \((\d+) in `REVIEW-PASS/, actual: () => openBoxes('REVIEW-PASS.md') },
    { file: 'STATE.md', what: 'open boxes in PARITY.md', re: /in `REVIEW-PASS\.md`, (\d+) in `PARITY/, actual: () => openBoxes('PARITY.md') },
  ]

  for (const c of claims) {
    it(`${c.file} — ${c.what}`, () => {
      const m = read(c.file).match(c.re)
      // Not a skip: a claim that vanished is a claim nobody is checking any more.
      expect(m, `${c.file}: the sentence stating ${c.what} no longer matches ${c.re}. If you reworded it, update the regex here — do not delete the claim.`).not.toBeNull()
      expect(Number(m![1]), `${c.file} says ${m![1]} for ${c.what}; the code has ${c.actual()}`).toBe(c.actual())
    })
  }

  // Sanity: if these ever read 0, the extractors broke and every assertion above
  // would be trivially comparing 0 to a doc that also says 0.
  it('the extractors actually find things', () => {
    expect(guideCards()).toBeGreaterThan(20)
    expect(tours()).toBeGreaterThan(3)
    expect(registries()).toBeGreaterThan(3)
    expect(glossaryTerms()).toBeGreaterThan(15)
    // The matrix parser is the one here that fails SILENTLY into a plausible zero (see
    // its comment); a floor is the whole difference between a guard and a decoration.
    const m = matrixEntries()
    expect(m.entries).toBeGreaterThan(50)
    expect(m.states).toBeGreaterThanOrEqual(m.entries)
    expect(m.budgetedStates).toBeGreaterThan(30)
    expect(openBoxes('REVIEW-PASS.md')).toBeGreaterThan(0)
  })
})
