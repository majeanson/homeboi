import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE MOCK ↔ WIRE CONTRACT (2026-11-05, wave 0.4 of plans/2026-11-05-SOLIDIFY.md).
//
// e2e/mocks.ts stubs every /api/* GET for the browser suite, and the Worker's route
// table (worker/routes.ts) is the only list of what the API actually answers. Nothing
// tied the two: a fixture for a route that no longer exists keeps "passing" (an unknown
// GET answers `{}` 200 — a mocked page never 404s), and a route with no fixture is
// invisible to every spec. The 2026-11-05 audit found the `health` fixture four keys
// wide against a fifteen-key handler; the SHAPE of that one is now a type
// (functions/_lib/wire.ts — tsc holds it). This test holds the two things a type cannot:
//
//   1. every fixture key names a route in the TABLE (fail-closed — plant `healthz`);
//   2. the number of GET-able routes with NO fixture is a RATCHET (falls, never rises):
//      wave 6 of the plan types and fixtures them family by family.
//
// The table is read as text, not imported: importing worker/routes.ts pulls every
// handler and its workers-types into vitest's node runtime.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function tableKeys(): string[] {
  const src = readFileSync(join(rootDir, 'worker/routes.ts'), 'utf8')
  const start = src.indexOf('const TABLE')
  const end = src.indexOf('\n}', start)
  const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // A key is quoted when it holds a slash (`'auth/me': authMe`) and a SHORTHAND property
  // otherwise (`board,` — the module is imported under the route's own name).
  return [...body.matchAll(/^\s*(?:'([^']+)'\s*:|([a-zA-Z0-9_]+)\s*,)/gm)].map((m) => m[1] ?? m[2])
}

async function fixtureKeys(): Promise<string[]> {
  const mod = (await import('../../e2e/mocks')) as { ROUTES: Record<string, unknown> }
  return Object.keys(mod.ROUTES)
}

describe('e2e mocks ↔ worker route table', () => {
  it('found the table (a broken parser must not pass vacuously)', () => {
    const keys = tableKeys()
    expect(keys).toEqual(expect.arrayContaining(['auth/me', 'board', 'health', 'members']))
    expect(keys.length).toBeGreaterThan(100)
  })

  it('every fixture key is a route the Worker serves', async () => {
    const table = new Set(tableKeys())
    const orphans = (await fixtureKeys()).filter((k) => !table.has(k))
    expect(orphans.join(', '), 'a fixture for a route that no longer exists keeps passing — delete it or fix the key').toBe('')
  })

  // 127 routes, 44 fixtures on 2026-11-05 → 83 without one. A route may legitimately
  // have none (a POST-only door, an admin endpoint no spec opens); the pin only says
  // the gap may not GROW silently — a new GET route either gets a fixture or is noticed.
  const UNFIXTURED_MAX = 83
  it(`routes without a fixture: at most ${UNFIXTURED_MAX} (ratchet — lower it when you add fixtures)`, async () => {
    const fixtures = new Set(await fixtureKeys())
    const missing = tableKeys().filter((k) => !fixtures.has(k))
    expect(missing.length, `unfixtured routes:\n${missing.join('\n')}`).toBeLessThanOrEqual(UNFIXTURED_MAX)
  })

  it('the health fixture carries the whole wire (the canary for the typed-fixture rule)', async () => {
    const mod = (await import('../../e2e/mocks')) as { ROUTES: Record<string, Record<string, unknown>> }
    expect(Object.keys(mod.ROUTES.health).length).toBeGreaterThanOrEqual(15)
  })
})
