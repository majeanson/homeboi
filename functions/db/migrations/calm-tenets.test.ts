import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// NFR-CALM-1/3 enforced structurally: the schema must have nowhere to store a
// hoardable score or a push subscription. This scans EVERY migration (not just
// the initial one), so a future migration that adds such a table fails loudly —
// the anti-addiction stance can't drift in by accident as the schema grows.
const here = dirname(fileURLToPath(import.meta.url))
// Strip `-- ...` comment lines first: the schema's own comments NAME the
// forbidden tables to explain their absence, and we only care about real DDL.
const schema = readdirSync(here)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

describe('calm tenets (schema)', () => {
  const forbidden = ['streak', 'points', 'badge', 'push_subscription']
  for (const word of forbidden) {
    it(`has no "${word}" table or column`, () => {
      expect(schema.includes(word)).toBe(false)
    })
  }

  it('keeps only low/out, not a full pantry inventory', () => {
    // pantry_low exists; a "quantity"/"stock" column would mean we drifted into
    // inventory upkeep (brief tenet 3).
    expect(schema.includes('pantry_low')).toBe(true)
    expect(schema.includes('quantity')).toBe(false)
    expect(schema.includes('stock_count')).toBe(false)
  })
})

// NFR-CALM-1 extends past the schema to the chore fairness ledger: it is an
// observation surface ("who did what this week"), never a leaderboard. The
// scoring vocabulary must stay out of the ledger code too, so a future edit
// can't quietly turn attribution into a score/rank. We scan the ledger sources
// (handler + component) with the same drift-proof approach as the schema scan.
// Strip `//` comment lines first — the ledger's own comments NAME the forbidden
// ideas ("NO count, NO ranking, …") to explain their absence; only live code
// counts. JS string concatenation keeps these literals out of THIS file's scan.
const repoRoot = join(here, '..', '..', '..')
const ledgerSrc = [
  join(repoRoot, 'functions', 'api', 'chores-ledger.ts'),
  join(repoRoot, 'src', 'components', 'ChoreLedger.tsx'),
]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')
  .toLowerCase()

describe('calm tenets (chore fairness ledger)', () => {
  // No scoreboard vocabulary in the live ledger code (comments are stripped above).
  const banned = ['leaderboard', 'scoreboard', 'ranking', 'tally', 'streak', 'points', 'badge']
  for (const word of banned) {
    it(`ledger code has no "${word}"`, () => {
      expect(ledgerSrc.includes(word)).toBe(false)
    })
  }
})
