import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// EVERY ROUTE IS WALKED (solidify 6.3, 2026-11-05). console-clean and spacing walk the list
// in e2e/routes.ts, and a list like that only stays honest when something compares it with
// the router: 26 routes had quietly never been opened by either sweep. The list gets its
// routes back, and a new <Route> joins it or says here why it cannot. Plant: add a route.

const root = join(__dirname, '..', '..')
const router = readFileSync(join(root, 'src/router.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const sweep = readFileSync(join(root, 'e2e/routes.ts'), 'utf8')

const paths = [...new Set([...router.matchAll(/<Route\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1]))]
const swept = [...sweep.matchAll(/['`](\/[^'`]*)['`]/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, 'x').split('?')[0])

// A route the sweep cannot use, each with why.
const ALLOWED: Record<string, string> = {
  '*': 'the catch-all: it redirects to the board',
  '/': 'the smart entry: it redirects by session',
  '/login': 'signed-out only: interactions.spec walks it',
  '/signup': 'signed-out only: interactions.spec walks it',
  '/pair': 'signed-out only: pairing has its own specs',
  '/routine/stickers': 'a redirect kept for old links',
  '/intake': 'a redirect kept for old links, to /courrier',
  '/garder': 'needs a sandbox session, else it redirects: the demo specs walk it',
  '/share': 'needs a share payload, else it redirects',
  '/dev/kit': 'renders loading specimens on purpose, so "finished loading" can never hold',
  '/voyage/partage/:id': 'its sync socket warns in dev StrictMode: the shared-voyage specs walk it',
  '/moment': 'a redirect kept for old links',
  '/kid': 'a redirect kept for old links',
  '/routines': 'a redirect kept for old links',
  '/cercle': 'a redirect kept for old links',
}

const reach = (p: string) => new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*')}/?$`)

describe('route sweep ↔ router', () => {
  it('the scan found the router (canary)', () => {
    expect(paths.length).toBeGreaterThan(50)
  })
  it('every route is in e2e/routes.ts or ALLOWED with a reason', () => {
    const missing = paths.filter((p) => !(p in ALLOWED) && !swept.some((s) => reach(p).test(s)))
    expect(missing).toEqual([])
  })
  it('ALLOWED holds no stale entry', () => {
    expect(Object.keys(ALLOWED).filter((p) => !paths.includes(p))).toEqual([])
  })
})
