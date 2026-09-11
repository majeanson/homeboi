import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FLIPP_BOOKMARKLET_BODY } from './flippList'

// public/flipp-paste.js is what a household's bookmark actually RUNS on flipp.com —
// a loader pulls it from their Babillard. It is generated from the body in
// lib/flippList (scripts/flipp-paste.mjs) so the string the unit test exercises and
// the string that ships are one string. This holds them together: a body edited
// without regenerating the file would ship the OLD behaviour while every test
// passed on the new one — the drift a served copy invites.
describe('public/flipp-paste.js is the bookmarklet body, verbatim', () => {
  it('matches src/lib/flippList — else run `node scripts/flipp-paste.mjs` and commit both', () => {
    // vitest's import.meta.url is not a file: URL — read from the repo root like docCounts does.
    const served = readFileSync(resolve(process.cwd(), 'public/flipp-paste.js'), 'utf8')
    expect(served, 'the served file carries the exact body').toContain('\n' + FLIPP_BOOKMARKLET_BODY + '\n')
    expect(served.startsWith('// « Coller de Babillard »'), 'the generated header').toBe(true)
  })
})
