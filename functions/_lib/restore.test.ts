import { describe, it, expect } from 'vitest'
import { CONTENT_TABLES, HOUSEHOLD_KEEP, RESET_KEEP, RESET_TABLES, chunk, fitRow, freshIdMap, idsIn, rewriteIds, upgradeTakeout, validateTakeout } from './restore'
import { TAKEOUT_EXCLUDE } from './takeout'
import { addLocalDays, localDayStart } from './ids'
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
    const moved = t.tables.notes!.find((n) => n.id === 'm1')!
    expect(moved).toMatchObject({ member_id: 'papa', for_member_id: 'lea', saved_at: 9, text: 'Bravo' })
    expect(moved).not.toHaveProperty('reply_to') // the threads went with the table
    expect(t.tables.notes!.map((n) => n.id).sort()).toEqual(['m1', 'n1']) // the deleted one stays gone
  })

  it('leaves a copy taken after 0142 exactly as it is', () => {
    const t = { ...base, tables: { notes: [{ id: 'n1' }] } }
    expect(upgradeTakeout(t)).toBe(t)
  })
})

describe('upgradeTakeout (a pre-0150 copy: chores in `tasks`, loose to-dos in `todos`)', () => {
  // Real instants, in America/Toronto (no request: the default zone): the old chore form wrote
  // a UTC midnight (the 14th, which every reader showed as the 13th), a to-do a local midnight.
  const UTC14 = Date.UTC(2026, 2, 14) / 1000
  const LOCAL20 = localDayStart(new Date(Date.UTC(2026, 2, 20, 12)))
  const MADE = Date.UTC(2026, 1, 1, 15, 37) / 1000
  const chore = { id: 'choreAAAAAAA', household_id: 'hhAAAAAAAAAA', title: 'Bac', rotation_json: '["m1"]', current_idx: 0, last_done_at: 5, last_done_by: 'm1', created_at: MADE, colour: '#88A36F', recur_json: '{"freq":"weekly"}', recur_start: UTC14, lead_seconds: null, is_sample: 0, announce_evening: 1, subject_kind: null, subject_id: null, cleared_at: null, icon: null, effort: 2 }
  const loose = { id: 'todoAAAAAAAA', household_id: 'hhAAAAAAAAAA', title: 'Appeler', day: LOCAL20, member_id: 'm2', position: 4, done_at: null, created_at: MADE, updated_at: 6, section: null, is_sample: 0, source_template_id: null, subject_kind: null, subject_id: null, icon: null, colour: null, effort: null }
  const departure = { ...loose, id: 'depAAAAAAAAA', section: 'Partir', source_template_id: 'tplAAAAAAAAA' }
  const up = upgradeTakeout({ ...base, tables: { tasks: [chore], todos: [loose, departure], home_projects: [{ id: 'homeAAAAAAAA', kind: 'plan', at: null }] } })

  it('moves the chores and the loose to-dos onto the spine, ids kept, with no kind (0153); the departure rows stay', () => {
    expect(up.tables.tasks).toBeUndefined()
    expect(up.tables.todos).toEqual([departure])
    expect(up.tables.home_projects!.map((r) => [r.id, r.kind])).toEqual([
      ['homeAAAAAAAA', 'plan'],
      ['choreAAAAAAA', null],
      ['todoAAAAAAAA', null],
    ])
  })
  it('maps each column the way 0150 does, and every day through the one encoder (0153)', () => {
    const [, c, t] = up.tables.home_projects!
    // The chore's start: the local day every reader showed it on (the 13th in Toronto), at midnight.
    expect(c).toMatchObject({ at: localDayStart(new Date(UTC14 * 1000)), recur_json: '{"freq":"weekly"}', rotation_json: '["m1"]', last_done_by: 'm1', announce_evening: 1, effort: 2, updated_at: MADE, colour: '#88A36F' })
    expect(c!.at).toBe(addLocalDays(localDayStart(new Date(Date.UTC(2026, 2, 14, 12))), -1))
    expect(t).toMatchObject({ at: LOCAL20, last_done_at: null, member_id: 'm2', position: 4, colour: null, updated_at: 6 })
    // No `undefined` reaches a bind: D1 refuses one.
    for (const r of up.tables.home_projects!.slice(1)) for (const v of Object.values(r)) expect(v).not.toBeUndefined()
  })
  it('is idempotent, brings a copy from between 0150 and 0153 forward, and leaves a post-0153 copy alone', () => {
    expect(upgradeTakeout(up)).toEqual(up)
    const between = upgradeTakeout({ ...base, tables: { todos: [departure], home_projects: [{ id: 'x', kind: 'chore', at: UTC14 }] } })
    expect(between.tables.home_projects).toEqual([{ id: 'x', kind: null, at: localDayStart(new Date(UTC14 * 1000)) }])
    const post = { ...base, tables: { todos: [departure], home_projects: [{ id: 'x', kind: null, at: LOCAL20 }] } }
    expect(upgradeTakeout(post)).toBe(post)
  })
  it('writes 0152’s start: a recurring chore with none gets its created_at’s day, from `tasks` or already on the spine', () => {
    const noStart = upgradeTakeout({ ...base, tables: { tasks: [{ ...chore, recur_start: null }] } })
    expect(noStart.tables.home_projects![0]).toMatchObject({ at: localDayStart(new Date(MADE * 1000)) })
    const between = { ...base, tables: { home_projects: [
      { id: 'a', kind: 'chore', at: null, recur_json: '{"freq":"daily"}', created_at: MADE },
      { id: 'b', kind: 'chore', at: null, recur_json: '{"freq":"hourly"}', created_at: MADE + 1 },
      { id: 'c', kind: 'upkeep', at: null, recur_json: '{"freq":"daily"}', created_at: MADE + 2 },
    ] } }
    // Only the real recurrence on a chore: a malformed one is a one-off, an undated home row stays undated.
    expect(upgradeTakeout(between).tables.home_projects!.map((r) => r.at)).toEqual([localDayStart(new Date(MADE * 1000)), null, null])
  })
})
