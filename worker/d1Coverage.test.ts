import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// WHICH ENDPOINTS HAVE EVER MET A REAL D1 (solidify 7.2, 2026-11-05). The isolation sweep
// walks every route, but it proves a handler leaks nothing, not that it works: a positive
// path needs a test that names the route. This ratchet says how many have none and can
// only fall. Plant: rename a path string in a *.d1.test.ts so one route loses its test.
//
// A route counts when a test holds its path as a STRING: a quote right before `/api/`, and
// the path ending there. So a comment naming a route buys nothing, and `/api/car` is not
// « named » by `/api/car-day`. TABLE has two key shapes, `'quoted': mod` and the shorthand
// `events,`; both are read, because the first version of this file saw only the quoted
// ones and so left out 45 routes (the regex is the whole of the bug, the canary pins it).
const UNTESTED_MAX = 97

const here = __dirname
const routes = readFileSync(join(here, 'routes.ts'), 'utf8')
const table = routes.slice(routes.indexOf('const TABLE'), routes.indexOf('\n}', routes.indexOf('const TABLE')))
const paths = [...table.matchAll(/^\s*(?:'([a-z][a-z0-9/-]*)':\s|([a-z][a-z0-9]*),$)/gm)].map((m) => m[1] ?? m[2])

const tests = readdirSync(here)
  .filter((f) => f.endsWith('.d1.test.ts'))
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n')

const named = (p: string) => new RegExp(`['"\`]/api/${p}(?![a-z0-9/-])`).test(tests)

describe('d1 coverage', () => {
  it('found the route table (canary)', () => {
    expect(paths.length).toBeGreaterThan(120)
    expect(paths, 'a shorthand key').toContain('events')
    expect(paths, 'a quoted key').toContain('meal-leftovers')
  })
  it(`routes no *.d1.test.ts names: at most ${UNTESTED_MAX}`, () => {
    const untested = paths.filter((p) => !named(p))
    expect(untested.length, untested.join(' ')).toBeLessThanOrEqual(UNTESTED_MAX)
  })
})
