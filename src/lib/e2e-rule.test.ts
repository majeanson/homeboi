import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// THE E2E SUITE'S OWN DEBT (solidify 6.1, 2026-11-05). Three counts that only fall. A spec
// with its own `boot` drifts from the fixture: each one re-decides the viewport, the seeded
// state and when a page counts as ready. A `waitForTimeout` is a guess about time, and the
// flake it causes reads as noise. `as any` hides a real type from the one layer that
// would have caught a renamed field. Planted red with one more of each.
const BOOT_MAX = 0
const WAIT_MAX = 125

const dir = join(__dirname, '../../e2e')
const specs = readdirSync(dir)
  .filter((f) => /\.ts$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(dir, f), 'utf8') }))
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, '')

describe('e2e debt only falls', () => {
  it('found the suite (canary)', () => {
    expect(specs.length).toBeGreaterThan(100)
  })
  it(`specs with their own boot: at most ${BOOT_MAX}`, () => {
    const own = specs.filter(({ f, text }) => /\.spec\.ts$/.test(f) && /\b(async function|function|const) boot\b/.test(code(text)))
    expect(own.length, 'use app.boot from e2e/fixtures.ts').toBeLessThanOrEqual(BOOT_MAX)
  })
  it(`waitForTimeout: at most ${WAIT_MAX}`, () => {
    const n = specs.reduce((sum, { text }) => sum + (code(text).match(/\.waitForTimeout\(/g) ?? []).length, 0)
    expect(n, 'wait for a condition: expect.poll, toHaveCount, toBeVisible').toBeLessThanOrEqual(WAIT_MAX)
  })
  it('no `as any`', () => {
    expect(specs.filter(({ text }) => /\bas any\b/.test(code(text))).map((s) => s.f)).toEqual([])
  })
})
