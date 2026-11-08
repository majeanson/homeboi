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

// A soft subject ref (0146) names one of five tables by its `*_kind` column, so a FK could
// only ever be wrong, and NOT NULL would make « no subject » unsayable. The rest of the
// convention is the comment CLAUDE.md asks of every soft ref, here on the file as a whole.
const softRefLines = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .split('\n')
    .filter((l) => /\bsubject_(kind|id)\b/i.test(l))

// A REBUILD re-declares columns an older migration made: they are not new columns, and changing
// their meaning inside a rebuild would change every reader at once. Each one is named, with why.
const CARRIED: Record<string, readonly string[]> = {
  // The spine rebuild (0150) carries home_projects.recur_json from 0074 (and tasks' from 0019):
  // NULL means « no recurrence », and every reader on both sides tests it that way.
  '0150_tasks_one_table.sql': ['recur_json'],
}

describe('migrations after 0145 follow the conventions', () => {
  it('the frozen line still exists (canary)', () => {
    expect(readdirSync(__dirname).some((f) => f.startsWith('0145_'))).toBe(true)
  })
  for (const f of newer) {
    const lines = columnLines(readFileSync(join(__dirname, f), 'utf8'))
    it(`${f}: colour and position, in their one spelling`, () => {
      expect(lines.filter((l) => /\b(color|sort_order|sort)\s+(TEXT|INTEGER|REAL)/i.test(l))).toEqual([])
    })
    it(`${f}: a subject ref is soft, nullable and commented as such`, () => {
      const sql = readFileSync(join(__dirname, f), 'utf8')
      const refs = softRefLines(sql)
      expect(refs.filter((l) => /NOT NULL|REFERENCES/i.test(l))).toEqual([])
      if (refs.length > 0) expect(sql).toMatch(/PAS DE CLÉ ÉTRANGÈRE/)
    })
    it(`${f}: a *_json column is NOT NULL with a default`, () => {
      const carried = CARRIED[f] ?? []
      expect(lines.filter((l) => /_json\s+TEXT/i.test(l) && !/NOT NULL/i.test(l) && !/DEFAULT/i.test(l) && !carried.some((c) => new RegExp(`^\\s*${c}\\s`).test(l)))).toEqual([])
    })
  }
})
