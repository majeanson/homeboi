import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { UNKNOWN_GET } from './mocks'

// THE GETS THE MOCK DID NOT KNOW (solidify 6.2, 2026-11-06). An unknown /api GET answers
// `{}` 200 and that stays: it is what keeps a mocked page from hanging, and every test
// boots through it. What it must not stay is silent: a page reading `{}` where
// the Worker would have answered a shape is a test that proves less than it says, and
// the health fixture went months that way.
//
// mockApi's fallback names the path on the running test as an annotation. Annotations
// travel to this reporter from every worker, so there is no shared file to race on, and
// a shard only sees its own tests. That is why the check is one-way: a path outside
// e2e/unknown-gets.json fails the run, and a listed path not seen proves nothing here.
// The list only shrinks: `docCounts.test.ts` pins its length. A path comes off it by
// getting a fixture in e2e/mocks.ts (typed in functions/_lib/wire.ts).
//
// It is a reporter rather than a globalTeardown because teardown runs in the main
// process with no view of what the workers saw. `--reporter=list` on the command line
// replaces it, so such a run records nothing and checks nothing.

interface Listed {
  path: string
  why: string
}

export default class UnknownGetsReporter implements Reporter {
  private readonly seen = new Map<string, string>()

  onTestEnd(test: TestCase, result: TestResult) {
    for (const a of result.annotations) {
      if (a.type === UNKNOWN_GET && a.description && !this.seen.has(a.description)) this.seen.set(a.description, test.titlePath().slice(2).join(' › '))
    }
  }

  async onEnd(result: FullResult) {
    const listed = JSON.parse(readFileSync(join(import.meta.dirname, 'unknown-gets.json'), 'utf8')) as Listed[]
    const known = new Set(listed.map((l) => l.path))
    const fresh = [...this.seen].filter(([path]) => !known.has(path))
    console.log(`\nUnknown GET paths answered {}: ${this.seen.size} seen, ${listed.length} listed in e2e/unknown-gets.json`)
    for (const path of [...this.seen.keys()].sort()) console.log(`  ${path}`)
    if (!fresh.length) return
    console.error('\nNot in e2e/unknown-gets.json. Give each a fixture in e2e/mocks.ts (the list only shrinks):')
    for (const [path, title] of fresh) console.error(`  ${path}  (first hit by: ${title})`)
    return { status: result.status === 'interrupted' ? result.status : ('failed' as const) }
  }
}
