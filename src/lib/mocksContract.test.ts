import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Wire } from '../../functions/_lib/wire'

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
//   2. every GET route with NO fixture is NAMED below with the reason it has none
//      (wave 6.2): FIXTURELESS is the exact set, so a new GET route either gets a fixture
//      or a sentence, and a route that gains a fixture has to leave the list.
//
// The table is read as text, not imported: importing worker/routes.ts pulls every
// handler and its workers-types into vitest's node runtime.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function tableEntries(): { key: string; mod: string }[] {
  const src = readFileSync(join(rootDir, 'worker/routes.ts'), 'utf8')
  const start = src.indexOf('const TABLE')
  const end = src.indexOf('\n}', start)
  const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // A key is quoted when it holds a slash (`'auth/me': authMe`) and a SHORTHAND property
  // otherwise (`board,` — the module is imported under the route's own name).
  return [...body.matchAll(/^\s*(?:'([^']+)'\s*:\s*(\w+)|([a-zA-Z0-9_]+))\s*,/gm)].map((m) => ({ key: (m[1] ?? m[3])!, mod: (m[2] ?? m[3])! }))
}
const tableKeys = (): string[] => tableEntries().map((e) => e.key)

// The routes whose module exports a GET: the only ones a browser test can read. The other
// 47 are POST-only doors, and counting them is why the first ratchet here said 83.
function getRoutes(): string[] {
  const src = readFileSync(join(rootDir, 'worker/routes.ts'), 'utf8')
  const files = new Map([...src.matchAll(/import \* as (\w+) from '\.\.\/(functions\/api\/.+)'/g)].map((m) => [m[1]!, m[2]!]))
  return tableEntries()
    .filter(({ mod }) => /export const onRequest(Get)?\b/.test(readFileSync(join(rootDir, `${files.get(mod)}.ts`), 'utf8')))
    .map((e) => e.key)
}

async function fixtureKeys(): Promise<string[]> {
  const mod = (await import('../../e2e/mocks')) as { ROUTES: Record<string, unknown> }
  return Object.keys(mod.ROUTES)
}

// Measured on the whole browser suite, 2026-11-06, through the recorder behind
// e2e/unknown-gets.json: nothing below is read by a page that fell through to `{}`.
// « stubbed per case » means the spec that opens it answers it itself with the case it
// is testing, and the answer depends on a token or a kind, so no default would be honest.
const FIXTURELESS: Record<string, string> = {
  'cercle-photos': 'no spec: only the contact photo strip reads it, and no spec opens one',
  'family-share': 'no spec: FamilyShareModal lists it, and no spec opens the modal',
  'flyer-img': 'answered above the table: mockApi serves a placeholder image for it',
  'guest/window': 'stubbed per case: the shape depends on the link kind (see e2e/unknown-gets.json)',
  list: 'the mock answers `?view=history` from LIST_HISTORY; a plain read has no caller, the board carries the list',
  mcp: 'not a browser route: an agent speaks JSON-RPC to it',
  'operator-join': 'stubbed per case: operator-join.spec answers each token (live, dead, already a member)',
  'pair/poll': 'no spec: it only polls once a tablet holds a pairing code, and no spec gets that far',
  pets: 'no spec reads it: the cercle read already carries `pets`, and the forms only write',
  'routine-stickers': 'stubbed per case: stickers.spec and routine-run-solid.spec seed the wall they test',
  'share-public': 'stubbed per case: the payload depends on the share kind (see e2e/unknown-gets.json)',
  'shared-trip-join': 'stubbed per case: voyage-share.spec answers each invitation',
  'shared-trip-notes': 'stubbed per case: voyage-share.spec',
  'shared-trip-packing': 'stubbed per case: voyage-share.spec',
  takeout: 'a file download, not a read: takeout-restore.spec stubs what it needs',
}
const FIXTURELESS_MAX = 15

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

  it('found the GET routes (a parser reading no handler would pass the exact-set check below on an empty list)', () => {
    const gets = getRoutes()
    expect(gets).toEqual(expect.arrayContaining(['board', 'health', 'pair/poll', 'takeout/backups']))
    expect(gets.length).toBeGreaterThan(70)
    expect(gets).not.toContain('auth/login')
  })

  it(`the GET routes without a fixture are exactly the ${Object.keys(FIXTURELESS).length} named above`, async () => {
    const fixtures = new Set(await fixtureKeys())
    const missing = getRoutes().filter((k) => !fixtures.has(k)).sort()
    expect(missing, 'a GET route needs a fixture in e2e/mocks.ts or a line in FIXTURELESS saying why not').toEqual(Object.keys(FIXTURELESS).sort())
  })

  it(`at most ${FIXTURELESS_MAX} of them (ratchet: lower it when one gains a fixture)`, () => {
    expect(Object.keys(FIXTURELESS).length).toBeLessThanOrEqual(FIXTURELESS_MAX)
  })

  it('the health fixture carries the whole wire (the canary for the typed-fixture rule)', async () => {
    const mod = await import('../../e2e/mocks')
    const canary: keyof Wire = 'health'
    expect(Object.keys(mod.ROUTES[canary] ?? {}).length).toBeGreaterThanOrEqual(15)
  })
})
