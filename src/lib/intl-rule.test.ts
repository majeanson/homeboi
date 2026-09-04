import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE FORMATTER RULE, made structural (sibling of write-rule.test.ts — same
// fail-closed shape, same shared plumbing).
//
// Constructing an Intl.DateTimeFormat/NumberFormat costs ~100 µs — three orders of
// magnitude more than the .format() call it enables — and this codebase keeps
// paying it in loops: /api/year burned 1.8 SECONDS of Worker CPU (free-plan budget
// ≈ 10 ms) building the same two formatters for every day of the year, and
// lib/format.ts rebuilt one per list ROW on every render of every meal badge,
// month cell and deal card, on a cheap wall tablet (both found + fixed
// 2026-09-03). The fix is always the same: ONE cached formatter per (locale,
// shape), because the shapes are finite.
//
// FAIL-CLOSED. A `new Intl.*` construction may only appear in a file listed below
// — the designated formatter homes, where every construction sits behind a Map
// cache. Anywhere else, reach for the cached helpers in lib/format.ts /
// lib/money.ts / lib/localDay.ts (client) or functions/_lib/ids.ts /
// askContext.ts (Worker); a genuinely new shape gets a new cached helper THERE,
// not an inline construction. Adding a file to ALLOWED is a decision: say where
// its cache is.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

// Scanned roots: the SPA, the Worker entry, and the Pages-Function handlers. The
// Worker matters MOST — its CPU budget is the one /api/year actually blew.
const ROOTS = [srcDir, join(rootDir, 'functions'), join(rootDir, 'worker')]

// file (repo-relative, /-separated) → where its cache lives. The reason IS the entry.
const ALLOWED = new Map<string, string>([
  ['src/lib/format.ts', 'fmtCache — one formatter per (lang, shape)'],
  ['src/lib/money.ts', 'moneyFmtCache — one per lang'],
  ['src/lib/localDay.ts', 'wallFmtCache/weekdayFmtCache — one per tz'],
  ['functions/_lib/ids.ts', 'wallFmtCache/weekdayFmtCache — one per tz'],
  ['functions/_lib/askContext.ts', 'askFmtCache — one per (lang, shape)'],
])

interface Site {
  file: string
  line: number
}

function intlConstructions(): Site[] {
  const out: Site[] = []
  for (const root of ROOTS) {
    for (const f of sourceFiles(root)) {
      const src = readScanned(f)
      for (const m of src.matchAll(/new\s+Intl\./g)) {
        out.push({
          file: relative(rootDir, f).split(sep).join('/'),
          line: src.slice(0, m.index).split('\n').length,
        })
      }
    }
  }
  return out
}

describe('the formatter rule (Intl construction only in the cached-formatter homes)', () => {
  const sites = intlConstructions()

  it('found Intl constructions to classify (the scanner still works)', () => {
    // The allowed homes construct on cache miss — if this reads zero the regex
    // broke and the assertion below is trivially green (the write-rule canary).
    expect(sites.length).toBeGreaterThan(3)
  })

  it('no Intl construction outside the documented formatter homes', () => {
    const offenders = sites.filter((s) => !ALLOWED.has(s.file)).map((s) => `${s.file}:${s.line}`)
    expect(
      offenders,
      'use the cached helpers in lib/format.ts / lib/money.ts / lib/localDay.ts (client) or functions/_lib/ids.ts / askContext.ts (Worker) — a new shape gets a new cached helper THERE. If a new file truly must construct its own, it needs its own cache AND an ALLOWED entry naming it',
    ).toEqual([])
  })

  it('every formatter home still constructs (a stale entry exempts the next arrival)', () => {
    const live = new Set(sites.map((s) => s.file))
    const dead = [...ALLOWED.keys()].filter((f) => !live.has(f))
    expect(dead, 'these files no longer construct Intl formatters — drop them from ALLOWED').toEqual([])
  })

  // `.toLocaleDateString()` and friends construct the SAME formatter internally on
  // every call — they are just the trap wearing a convenience method. The existing
  // sites are bounded per-row surfaces someone judged acceptable (worst:
  // HabitHistory at ~90 rows), so they are RATCHETED rather than banned: adding
  // one means either converting it to a lib/format.ts cached helper instead, or
  // deciding out loud that the new site is off every per-row/per-day path and
  // bumping this budget in the same commit.
  it('toLocale*String call sites do not grow silently (ratchet)', () => {
    let count = 0
    for (const f of sourceFiles(srcDir)) {
      count += [...readScanned(f).matchAll(/\.toLocale(?:Date|Time)?String\(/g)].length
    }
    expect(count, 'prefer a cached lib/format.ts helper; if the new site is genuinely off any hot path, bump the budget deliberately in this commit').toBeLessThanOrEqual(24)
  })
})
