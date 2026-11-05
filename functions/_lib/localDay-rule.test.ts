import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE DAY-ARITHMETIC RULE (2026-11-05, wave 1 of plans/2026-11-05-SOLIDIFY.md).
//
// CLAUDE.md has said it for months: a day off a LOCAL midnight is `addLocalDays`, never
// `± 86400` — a DST day is 23 or 25 hours long, so the fixed step lands at 23:00 / 01:00
// twice a year, which is the documented trap that made two e2e specs red twice a year
// and bit the very timezone test written to prove it. The prose held in most places and
// still let `recap.ts` compute « the last seven days » as `dayStart(…) - 86400 * 7`, and
// `suggest-meal.ts` its neglect cutoff as `today - 14 * 86400`. Prose rules drift; only
// tests hold (STATE §5).
//
// Two shapes fail, on ONE LINE (the shape both strays had):
//   A. a `dayStart(` / `localDayStart(` call and `86400` in the same statement;
//   B. a value NAMED as a day (`today`, `todayDay`, `daySec`, `midnight`…) ± n × 86400.
// Durations are fine and stay: `const DAY = 86400`, a TTL, a `now - 86_400` rolling
// window off a wall-clock instant (strangers / usage), a `/ 86400` day COUNT. The names
// in B are a list on purpose — a broad regex would flag those and get ALLOWED into
// meaninglessness.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TREES = ['functions', 'src', 'worker']

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : tsFiles(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.|\.d1\./.test(name) ? [p] : []
  })
}

// A: the midnight call and a ± 86400 step on one line. `/ 86400` — a day COUNT between
// two midnights (lib/localDay.ts does this, correctly) — is a division, not a step.
const SHAPE_A = /\b(?:dayStart|localDayStart)\s*\([^\n]*[-+]\s*(?:\d+\s*\*\s*)?86_?400\b|\b(?:dayStart|localDayStart)\s*\([^\n]*86_?400\s*\*\s*\d+/
const SHAPE_B = /\b(?:today|todayDay|todaySec|daySec|day0|midnight|localMidnight)\b\s*[-+]\s*(?:\d+\s*\*\s*)?86_?400\b/

describe('day arithmetic off a local midnight', () => {
  it('found the trees (a broken walker must not pass vacuously)', () => {
    expect(tsFiles(join(rootDir, 'functions')).some((f) => f.endsWith('recap.ts'))).toBe(true)
  })

  it('never adds or subtracts ×86400 from a local midnight — addLocalDays is the step', () => {
    const bad: string[] = []
    for (const tree of TREES) {
      for (const f of tsFiles(join(rootDir, tree))) {
        const lines = readFileSync(f, 'utf8').split('\n')
        lines.forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '')
          if (SHAPE_A.test(code) || SHAPE_B.test(code)) bad.push(`${relative(rootDir, f).split(sep).join('/')}:${i + 1}  ${code.trim()}`)
        })
      }
    }
    expect(bad.join('\n'), 'use addLocalDays(daySec, n) — a DST day is not 86 400 s long (CLAUDE.md « Day arithmetic on a local midnight »)').toBe('')
  })
})
