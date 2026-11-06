import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// THE SCHEMA CONVENTIONS, FORWARD ONLY (solidify 6.6, 2026-11-05). CLAUDE.md's « Schema
// conventions » are forward rules: existing outliers stay, because an applied migration is
// frozen. So this binds what comes after 0145: `colour` not `color`, `position` not
// `sort_order`, and a `*_json` column NOT NULL with a default, so no reader guards a NULL.
// Plant: a real 0999_plant.sql on disk, then delete it.

const FROZEN_THROUGH = 145
const newer = readdirSync(__dirname).filter((f) => {
  const n = /^(\d{4})_.*\.sql$/.exec(f)
  return n !== null && Number(n[1]) > FROZEN_THROUGH
})

const columnLines = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .split('\n')
    .filter((l) => /^\s*(ALTER TABLE .* ADD COLUMN\s+)?[a-z_]+\s+(TEXT|INTEGER|REAL|BLOB)\b/i.test(l))

describe('migrations after 0145 follow the conventions', () => {
  it('the frozen line still exists (canary)', () => {
    expect(readdirSync(__dirname).some((f) => f.startsWith('0145_'))).toBe(true)
  })
  for (const f of newer) {
    const lines = columnLines(readFileSync(join(__dirname, f), 'utf8'))
    it(`${f}: colour and position, in their one spelling`, () => {
      expect(lines.filter((l) => /\b(color|sort_order|sort)\s+(TEXT|INTEGER|REAL)/i.test(l))).toEqual([])
    })
    it(`${f}: a *_json column is NOT NULL with a default`, () => {
      expect(lines.filter((l) => /_json\s+TEXT/i.test(l) && !/NOT NULL/i.test(l) && !/DEFAULT/i.test(l))).toEqual([])
    })
  }
})
