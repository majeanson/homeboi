import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// ONE CACHE KEY, ONE SHAPE.
//
// TanStack Query keeps one entry per key. Two readers that fetch DIFFERENT endpoints under
// the SAME key write two shapes into one entry, and whichever runs second breaks the first
// — silently, because each one's own tests stub its own shape. It nearly happened on
// 2026-09-29: the discovery probe reads MOTS_KEY raw, and the mots readers were about to
// store a mapped array under the same key (the fix: the cache holds the wire shape, and
// `select` maps). Nothing would have said so.
//
// The guard: for every query key — a shared constant from queryKeys.ts, or one a file
// declares for itself — collect the endpoint each `useQuery`/`fetchQuery`/`prefetchQuery`
// fetches with it, and the `{ key, path }` pairs of the discovery probes. A key fed by two
// different endpoints fails. Keys are grouped by their VALUE, not their name: a file-local
// `SHARES_KEY = ['family-shares']` is a different entry from the shared `['shares']`
// (and was renamed, 2026-09-30 — a scanner reading names was fooled by it, and so would
// a person be).

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(srcDir, '..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const constArrays = (src: string) =>
  new Map([...src.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*_KEY)\s*=\s*(\[[^\]]*\])/g)].map((m) => [m[1], m[2].replace(/\s+/g, '')]))

/** key value → endpoint → files */
function keyEndpoints(): Map<string, Map<string, Set<string>>> {
  const shared = constArrays(readFileSync(join(srcDir, 'lib', 'queryKeys.ts'), 'utf8'))
  const out = new Map<string, Map<string, Set<string>>>()
  for (const f of sources(srcDir)) {
    const src = readFileSync(f, 'utf8')
    const local = constArrays(src)
    const valueOf = (name: string) => local.get(name) ?? shared.get(name) ?? `?${name}`
    const rel = relative(root, f).split(sep).join('/')
    const add = (name: string, path: string) => {
      const endpoint = path.split('?')[0].split('${')[0].replace(/\/$/, '')
      const key = valueOf(name)
      const byEndpoint = out.get(key) ?? new Map<string, Set<string>>()
      byEndpoint.set(endpoint, new Set([...(byEndpoint.get(endpoint) ?? []), rel]))
      out.set(key, byEndpoint)
    }
    // `queryKey: X_KEY, … queryFn: () => api('path')` inside one options object.
    for (const m of src.matchAll(/queryKey:\s*([A-Z][A-Z0-9_]*_KEY)\b([\s\S]{0,400}?)(?:\}\s*\)|\n\s*\}\))/g)) {
      const api = m[2].match(/queryFn:[\s\S]*?\bapi(?:<[\s\S]*?>)?\(\s*[`'"]([^`'"]+)[`'"]/)
      if (api) add(m[1], api[1])
    }
    // The discovery probes: `{ key: X_KEY, path: 'endpoint' }` (lib/discovery).
    for (const m of src.matchAll(/key:\s*([A-Z][A-Z0-9_]*_KEY)\s*,\s*path:\s*'([^']+)'/g)) add(m[1], m[2])
  }
  return out
}

describe('one cache key, one shape', () => {
  const found = keyEndpoints()

  it('finds the keyed reads at all', () => {
    // Against a vacuous pass: a pattern that stopped matching would report « no conflict ».
    expect(found.size).toBeGreaterThan(40)
    expect(found.get("['mots']")?.has('notes'), 'the mots readers and the discovery probe both fetch /api/notes').toBe(true)
  })

  it('no key is fed from two different endpoints', () => {
    const conflicts = [...found]
      .filter(([, byEndpoint]) => byEndpoint.size > 1)
      .map(([key, byEndpoint]) => `${key}: ${[...byEndpoint].map(([e, fs]) => `${e} ← ${[...fs].join(', ')}`).join(' | ')}`)
    expect(conflicts, 'two shapes under one cache entry — give one of them its own key, or map with `select`').toEqual([])
  })
})
