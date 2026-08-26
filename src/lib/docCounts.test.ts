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
    { file: 'DISCOVERY.md', what: 'guide cards (add-a-feature step 1)', re: /there\s+are \*\*(\d+)\*\* today/, actual: guideCards },
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
  })
})
