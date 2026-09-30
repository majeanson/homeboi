import { describe, it, expect } from 'vitest'
import { CONTENT_TABLES, HOUSEHOLD_KEEP, RESET_KEEP, RESET_TABLES, chunk, fitRow, freshIdMap, idsIn, rewriteIds, upgradeTakeout, validateTakeout } from './restore'
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

// « Repartir à neuf » (2026-09-23) wipes RESET_TABLES: the content set minus RESET_KEEP.
// A keep entry that names nothing (a table renamed next year) would silently protect
// nothing — the settings would start going with the content, and nobody would know.
describe('the reset set', () => {
  it('keeps the settings and the spend meter — and every name it keeps is a real content table', () => {
    expect([...RESET_KEEP].sort()).toEqual(['household_preferences', 'usage_daily'])
    for (const t of RESET_KEEP) {
      expect(CONTENT_TABLES, `RESET_KEEP names ${t}, which the content set does not hold`).toContain(t)
      expect(RESET_TABLES, t).not.toContain(t)
    }
    expect(RESET_TABLES.length).toBe(CONTENT_TABLES.length - RESET_KEEP.size)
  })
  it('never reaches who may open the household', () => {
    for (const t of ['operators', 'devices', 'guests', 'shares', 'pairing_codes']) expect(RESET_TABLES, t).not.toContain(t)
    for (const t of ['members', 'recipes', 'events', 'notes', 'list_items', 'photos']) expect(RESET_TABLES, t).toContain(t)
  })
})
// A nightly copy from BEFORE migration 0142 keeps its mots in a `mots` table the database
// no longer has (0143 dropped it). Restore would skip an unknown table — every mot gone,
// on the one day a household asked for its things back. upgradeTakeout brings the dump
// forward the way the migration brought the database.
describe('upgradeTakeout (a pre-0142 copy)', () => {
  const base = { app: 'babillard', format: 1 as const, householdId: 'h1', exportedAt: 0, household: null, skipped: [], media: [] }
  const MOT = { id: 'm1', household_id: 'h1', member_id: 'lea', author_member_id: 'papa', text: 'Bravo', created_at: 5, opened_at: null, saved_at: 9, surface_at: null, deleted_at: null, reply_to: null, is_sample: 0 }

  it('turns each live mot into an addressed fridge note — author and recipient the right way round', () => {
    const t = upgradeTakeout({ ...base, tables: { mots: [MOT, { ...MOT, id: 'm2', deleted_at: 7 }], notes: [{ id: 'n1', text: 'lait' }] } })
    expect(t.tables.mots).toBeUndefined()
    const moved = t.tables.notes.find((n) => n.id === 'm1')!
    expect(moved).toMatchObject({ member_id: 'papa', for_member_id: 'lea', saved_at: 9, text: 'Bravo' })
    expect(moved).not.toHaveProperty('reply_to') // the threads went with the table
    expect(t.tables.notes.map((n) => n.id).sort()).toEqual(['m1', 'n1']) // the deleted one stays gone
  })

  it('leaves a copy taken after 0142 exactly as it is', () => {
    const t = { ...base, tables: { notes: [{ id: 'n1' }] } }
    expect(upgradeTakeout(t)).toBe(t)
  })
})
