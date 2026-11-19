import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE FORMATTER RULE. Constructing an Intl formatter costs ~100 µs, a thousand times the
// .format() it enables (/api/year burned 1.8 s of Worker CPU on it, 2026-09-03). The BAN on an
// inline `new Intl.*` outside a cached formatter home is the oxlint rule
// `babillard/no-intl-construction` now (review #41, scripts/lint-rules.mjs). What stays here is
// the one part a lint rule cannot hold: a RATCHET on the convenience methods that construct the
// same formatter internally.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the formatter rule (the toLocale*String ratchet)', () => {
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
