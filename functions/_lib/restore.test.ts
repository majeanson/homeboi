import { describe, it, expect } from 'vitest'
import { CONTENT_TABLES, HOUSEHOLD_KEEP, chunk, fitRow, freshIdMap, idsIn, rewriteIds, validateTakeout } from './restore'
import { TAKEOUT_EXCLUDE } from './takeout'
import { HOUSEHOLD_TABLES } from './demoHousehold'

// The pure half of the restore (STATE.md §4-L L8); the round trip against a real D1
// is worker/restore.d1.test.ts.

const base = { app: 'Babillard', format: 1 as const, householdId: 'hhAAAAAAAAAA', exportedAt: 1, household: null, skipped: [], media: [] }

describe('validateTakeout', () => {
  it('accepts the dump shape and refuses everything else with a reason', () => {
    expect(validateTakeout({ ...base, tables: { notes: [{ id: 'x' }] } }).ok).toBe(true)
    expect(validateTakeout(null)).toMatchObject({ ok: false, error: 'not an object' })
    expect(validateTakeout({ ...base, format: 2, tables: {} })).toMatchObject({ ok: false, error: 'unknown format' })
    expect(validateTakeout({ ...base, tables: [] })).toMatchObject({ ok: false, error: 'no tables' })
    expect(validateTakeout({ ...base, tables: { 'drop table': [] } })).toMatchObject({ ok: false })
    expect(validateTakeout({ ...base, tables: { notes: 'nope' } })).toMatchObject({ ok: false })
    expect(validateTakeout({ ...base, tables: { notes: [1] } })).toMatchObject({ ok: false })
  })
})

describe('ids', () => {
  it('collects every row id, and a fresh map keeps each id’s length', () => {
    const t = { ...base, tables: { notes: [{ id: 'abcdefghjkmn' }, { id: 'short' }], tasks: [{ id: 'ABCDEFGHJKMN' }] } }
    const ids = idsIn(t)
    expect(ids).toEqual(['abcdefghjkmn', 'ABCDEFGHJKMN'])
    const map = freshIdMap(ids)
    for (const id of ids) {
      expect(map.get(id)!.length).toBe(id.length)
      expect(map.get(id)).not.toBe(id)
    }
  })

  it('rewrites a mapped id in plain columns AND inside JSON text, and nothing else', () => {
    const map = new Map([['abcdefghjkmn', 'ZZZZZZZZZZZZ']])
    const [row] = rewriteIds([{ id: 'abcdefghjkmn', member_id: 'abcdefghjkmn', rotation_json: '["abcdefghjkmn","otherotherid"]', title: 'abcdefghjkmn is not a word here', n: 3 }], map)
    expect(row).toEqual({ id: 'ZZZZZZZZZZZZ', member_id: 'ZZZZZZZZZZZZ', rotation_json: '["ZZZZZZZZZZZZ","otherotherid"]', title: 'ZZZZZZZZZZZZ is not a word here', n: 3 })
  })

  it('an empty map is a no-op (the same-household restore keeps its ids)', () => {
    const rows = [{ id: 'abcdefghjkmn' }]
    expect(rewriteIds(rows, new Map())).toBe(rows)
  })
})

describe('fitRow', () => {
  it('keeps only live columns and re-points the household columns from the dump’s household to the target', () => {
    const live = new Set(['id', 'household_id', 'title'])
    expect(fitRow({ id: 'r', household_id: 'hhAAAAAAAAAA', title: 't', dropped_col: 1 }, live, 'hhAAAAAAAAAA', 'hhBBBBBBBBBB')).toEqual({ id: 'r', household_id: 'hhBBBBBBBBBB', title: 't' })
    // Another household's id on a row (a joined shared trip) is left alone.
    expect(fitRow({ id: 'r', household_id: 'hhOTHER00000' }, new Set(['id', 'household_id']), 'hhAAAAAAAAAA', 'hhBBBBBBBBBB')).toEqual({ id: 'r', household_id: 'hhOTHER00000' })
  })
})

describe('the content set', () => {
  it('is the sweep’s tables minus the identity tables takeout excludes — never operators/devices/guests', () => {
    for (const t of ['operators', 'devices', 'guests', 'shares', 'pairing_codes', 'idempotency_keys', 'ai_errors', 'household_domains']) {
      expect(CONTENT_TABLES, t).not.toContain(t)
      expect(TAKEOUT_EXCLUDE.has(t), t).toBe(true)
    }
    for (const t of ['members', 'recipes', 'events', 'notes', 'list_items', 'routines']) expect(CONTENT_TABLES, t).toContain(t)
    expect(CONTENT_TABLES.length).toBe(HOUSEHOLD_TABLES.filter((t) => !TAKEOUT_EXCLUDE.has(t)).length)
    expect([...HOUSEHOLD_KEEP]).toEqual(['id', 'tier', 'status', 'stripe_customer_id', 'created_at', 'invite_nonce'])
  })
  it('chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })
})
