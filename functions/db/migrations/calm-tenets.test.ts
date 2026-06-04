import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// NFR-CALM-1/3 enforced structurally: the schema must have nowhere to store a
// hoardable score or a push subscription. If a future migration adds one of
// these tables, this test fails loudly — the anti-addiction stance can't drift
// in by accident.
const here = dirname(fileURLToPath(import.meta.url))
// Strip `-- ...` comment lines first: the schema's own comments NAME the
// forbidden tables to explain their absence, and we only care about real DDL.
const schema = readFileSync(join(here, '0001_init.sql'), 'utf8')
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
