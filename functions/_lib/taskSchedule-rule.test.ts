import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONE SCHEDULER FOR TASKS (one task concept, phase 1, 2026-11-06). A chore's anchor is
// `recur_start ?? created_at`, and the board and the calendar each spelled that by hand, so a
// new rule would have had to land twice. It lives in _lib/upkeep.ts now. Planted red with the
// old line back in month.ts.

const root = join(__dirname, '..')
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : []
  })
const hits = walk(root)
  .filter((f) => /recur_start\s*\?\?/.test(readFileSync(f, 'utf8')))
  .map((f) => relative(root, f).split(sep).join('/'))

describe('a chore has one anchor', () => {
  it('only the scheduler resolves it (and the scan still finds it there)', () => {
    expect(hits).toEqual(['_lib/upkeep.ts'])
  })
})
