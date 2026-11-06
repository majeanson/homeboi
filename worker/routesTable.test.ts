import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// A HANDLER THAT NOTHING ROUTES (solidify 6.4, 2026-11-05). File path stopped being routing
// when the app left Pages: a handler file that misses the TABLE simply 404s, and CLAUDE.md's
// « BOTH a file AND a row » was prose. The second half matters more: `authed()` is what
// makes a handler safe, so the set of handlers WITHOUT it is pinned by name. Adding one is
// a decision about who may call it without a session. Plant: add a handler file.

const root = join(__dirname, '..')
const api = join(root, 'functions/api')
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
  })
const handlers = walk(api).map((f) => ({
  rel: relative(api, f).split(sep).join('/').replace(/\.ts$/, ''),
  src: readFileSync(f, 'utf8'),
}))
const routes = readFileSync(join(root, 'worker/routes.ts'), 'utf8')

// Reached before a session exists, or serving public bytes. Each says which.
const OPEN: Record<string, string> = {
  'auth/forgot': 'no session yet',
  'auth/login': 'no session yet',
  'auth/logout': 'clears a cookie, nothing to protect',
  'auth/me': 'answers « signed in or not »',
  'auth/reset': 'a signed one-time token is the credential',
  'auth/signup': 'no session yet, gated by INVITE_CODE',
  'auth/verify': 'a signed one-time token is the credential',
  demo: 'mints the visitor their sandbox',
  'flyer-img': 'a public image proxy with a host allowlist',
  health: 'a status probe with no household data',
  'img/[key]': 'keys are opaque and unguessable',
  'operator-join': 'a signed invite is the credential',
  'pair/poll': 'the tablet has no token until this answers',
  'pair/start': 'the tablet has no token until this answers',
}

describe('handlers ↔ the route table', () => {
  it('found the handlers (canary)', () => {
    expect(handlers.length).toBeGreaterThan(100)
  })
  it('every handler file is imported by worker/routes.ts', () => {
    const missing = handlers.filter((h) => !routes.includes(`functions/api/${h.rel}'`)).map((h) => h.rel)
    expect(missing).toEqual([])
  })
  it('the handlers without authed() are exactly the OPEN list', () => {
    const open = handlers.filter((h) => !/\bauthed\(/.test(h.src)).map((h) => h.rel).sort()
    expect(open).toEqual(Object.keys(OPEN).sort())
  })
})
