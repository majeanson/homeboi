import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// WHICH ENDPOINTS HAVE EVER MET A REAL D1 (solidify 7.2, 2026-11-05). The isolation sweep
// walks every route, but it proves a handler leaks nothing, not that it works: a positive
// path needs a test that names the route. This ratchet says how many have none and can
// only fall. Plant: rename a path string in a *.d1.test.ts so one route loses its test.
const UNTESTED_MAX = 67

const here = __dirname
const routes = readFileSync(join(here, 'routes.ts'), 'utf8')
const table = routes.slice(routes.indexOf('const TABLE'), routes.indexOf('\n}', routes.indexOf('const TABLE')))
const paths = [...table.matchAll(/^\s*'?([a-z][a-z0-9/-]*)'?:\s/gm)].map((m) => m[1])

const tests = readdirSync(here)
  .filter((f) => f.endsWith('.d1.test.ts'))
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n')

describe('d1 coverage', () => {
  it('found the route table (canary)', () => {
    expect(paths.length).toBeGreaterThan(80)
  })
  it(`routes no *.d1.test.ts names: at most ${UNTESTED_MAX}`, () => {
    const untested = paths.filter((p) => !tests.includes(`/api/${p}`))
    expect(untested.length, untested.join(' ')).toBeLessThanOrEqual(UNTESTED_MAX)
  })
})
