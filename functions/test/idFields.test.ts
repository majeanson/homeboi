import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from '../../src/lib/buildGuardScan'
import { ID_FIELDS } from './idFields'

// The isolation sweep's field list cannot drift (STATE.md §4-L, L3). The sweep runs in
// workerd, where there is no filesystem to harvest names from — so the harvest is
// this ordinary node-side guard: every `body.<x>Id` / `body.id` / `searchParams.get('<x>Id')`
// a handler reads must be a name the sweep knows to fill.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('isolation sweep — id field names', () => {
  it('every id-shaped field a handler reads is in ID_FIELDS', () => {
    const known = new Set(ID_FIELDS)
    const missing = new Map<string, string[]>()
    for (const file of sourceFiles(join(root, 'functions', 'api'))) {
      const src = readScanned(file)
      const names = new Set<string>()
      for (const m of src.matchAll(/\bbody\??\.(\w+Id|id)\b/g)) names.add(m[1])
      for (const m of src.matchAll(/searchParams\.get\('(\w+Id|id)'\)/g)) names.add(m[1])
      for (const n of names) if (!known.has(n)) missing.set(n, [...(missing.get(n) ?? []), relative(root, file)])
    }
    expect(
      [...missing.entries()].map(([n, files]) => `${n} (${files.join(', ')})`),
      'add the name to functions/test/idFields.ts so the isolation sweep fills it with another household’s ids',
    ).toEqual([])
  })
})
