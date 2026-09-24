import { describe, it, expect } from 'vitest'
import { alertFor, remarkLine, runNightly, type NightlyDeps, type NightlyReport } from './nightly'
import type { StrangerRemark } from './strangers'
import type { Env } from './env'
import { STRANGER_POOL_PER_DAY } from './usage'

// The nightly cron as a function with a report (STATE.md §4-L L7): every side effect
// behind a seam, so these cases hand in fakes and assert the REPORT and the DECISION.

function deps(over: Partial<NightlyDeps> = {}): NightlyDeps {
  return {
    listHouseholds: async () => ['h1', 'h2'],
    backup: async () => {},
    sweep: async () => 0,
    countAlive: async () => 0,
    countStale: async () => 0,
    strangerSpend: async () => ({ ai: 0, bytes: 0 }),
    strangerRemarks: async () => [],
    doorCounts: async () => ({ newHouseholds: 0, newConfirmed: 0, active: 0, stuckEmpty: 0 }),
    ...over,
  }
}
const env = { PHOTOS: {} } as unknown as Env
const NOW = 1_800_000_000

describe('runNightly', () => {
  it('backs every household up and reports the count', async () => {
    const backed: string[] = []
    const r = await runNightly(env, NOW, deps({ backup: async (id) => void backed.push(id) }))
    expect(backed).toEqual(['h1', 'h2'])
    expect(r).toMatchObject({ households: 2, backed: 2, failed: [], noBucket: false })
  })

  it('one household’s failure never skips the others, and is named', async () => {
    const r = await runNightly(env, NOW, deps({ backup: async (id) => { if (id === 'h1') throw new Error('R2 said no') } }))
    expect(r.backed).toBe(1)
    expect(r.failed).toEqual([{ id: 'h1', error: 'R2 said no' }])
  })

  it('sweeps before backing up, and counts what survived', async () => {
    const order: string[] = []
    const r = await runNightly(env, NOW, deps({
      sweep: async () => { order.push('sweep'); return 3 },
      backup: async () => void order.push('backup'),
      countAlive: async () => 4,
      countStale: async () => 1,
    }))
    expect(order[0]).toBe('sweep')
    expect(r).toMatchObject({ sandboxesSwept: 3, sandboxesAlive: 4, sandboxesStale: 1 })
  })

  it('a sweep that throws is a named failure, not a crash', async () => {
    const r = await runNightly(env, NOW, deps({ sweep: async () => { throw new Error('no such column') } }))
    expect(r.failed).toEqual([{ id: 'sweep', error: 'no such column' }])
    expect(r.backed).toBe(2)
  })

  it('reports what strangers spent together (the pool, 0139)', async () => {
    const r = await runNightly(env, NOW, deps({ strangerSpend: async () => ({ ai: 42, bytes: 3 * 1024 * 1024 }) }))
    expect(r).toMatchObject({ strangerAi: 42, strangerBytes: 3 * 1024 * 1024 })
  })

  it('reads the remarks BEFORE the sweep — a visitor’s remark dies with their sandbox', async () => {
    // Red against collecting them after the sweep (next to the other counts): the sweep
    // deletes the sandbox, and the remark with it.
    const order: string[] = []
    await runNightly(env, NOW, deps({
      strangerRemarks: async () => { order.push('remarks'); return [] },
      sweep: async () => { order.push('sweep'); return 0 },
    }))
    expect(order).toEqual(['remarks', 'sweep'])
  })

  it('a remarks or door query that throws is a named failure, not a lost night', async () => {
    const r = await runNightly(env, NOW, deps({
      strangerRemarks: async () => { throw new Error('no such table: remarks') },
      doorCounts: async () => { throw new Error('boom') },
    }))
    expect(r.failed.map((f) => f.id)).toEqual(['remarks', 'door'])
    expect(r.backed).toBe(2)
  })

  it('no R2 bucket is reported — backups silently not happening is the worst kind of quiet', async () => {
    const r = await runNightly({} as Env, NOW, deps())
    expect(r.noBucket).toBe(true)
  })
})

describe('alertFor', () => {
  const quiet: NightlyReport = { at: NOW, households: 1, backed: 1, failed: [], noBucket: false, sandboxesSwept: 0, sandboxesAlive: 0, sandboxesStale: 0, strangerAi: 0, strangerBytes: 0, remarks: [], door: null }
  it('a quiet weekday sends nothing', () => {
    expect(alertFor(quiet, 3)).toBeNull()
  })
  it('a quiet Monday sends the digest — proof the channel works', () => {
    const m = alertFor(quiet, 1)
    expect(m?.subject).toBe('Babillard va bien')
    expect(m?.text).toContain('Maisonnées : 1')
  })
  it('a failure alerts any day, naming the household and the error', () => {
    const m = alertFor({ ...quiet, failed: [{ id: 'h9', error: 'boom' }] }, 3)
    expect(m?.subject).toContain('mal tourné')
    expect(m?.text).toContain('ÉCHEC h9 : boom')
  })
  it('a stale sandbox that survived the sweep alerts — the sweep-is-broken signal', () => {
    const m = alertFor({ ...quiet, sandboxesStale: 2 }, 3)
    expect(m?.subject).toContain('2 bac(s) périmé(s)')
    expect(m?.text).toContain('SCOPE_COLUMN')
  })
  it('a FULL strangers’ pool alerts on a quiet weekday — and says what to do about it', () => {
    // Red against leaving poolFull out of the decision: the pool would fill in silence.
    const m = alertFor({ ...quiet, strangerAi: STRANGER_POOL_PER_DAY.ai }, 3)
    expect(m?.subject).toContain('réserve des inconnus')
    expect(m?.text).toContain('STRANGER_POOL_PER_DAY')
    expect(alertFor({ ...quiet, strangerBytes: STRANGER_POOL_PER_DAY.upload }, 3)?.subject).toContain('réserve')
    // Below the pool, a weekday stays quiet…
    expect(alertFor({ ...quiet, strangerAi: STRANGER_POOL_PER_DAY.ai - 1 }, 3)).toBeNull()
    // …and the Monday digest carries the reading anyway.
    expect(alertFor({ ...quiet, strangerAi: 7 }, 1)?.text).toContain('Inconnus (24 h) : 7 /')
  })
  const remark: StrangerRemark = { kind: 'bug', title: 'La liste ne se vide pas', body: 'Je coche, rien ne part.', seenPath: '/liste', createdAt: NOW - 60, householdId: 'hhX', sandbox: false }
  it('a remark from another household sends a mail on a quiet weekday — nobody else reads it', () => {
    // Red against leaving remarks out of the decision: a stranger's bug report would sit
    // in a household nobody on the maker's side ever opens.
    const m = alertFor({ ...quiet, remarks: [remark, { ...remark, title: 'Autre', sandbox: true }] }, 3)
    expect(m?.subject).toBe('Babillard — 2 remarques d’ailleurs')
    expect(m?.text).toContain('[bug] La liste ne se vide pas')
    expect(m?.text).toContain('[bug · démo] Autre')
  })
  it('a louder subject still carries the remarks — they never wait for a quiet night', () => {
    const m = alertFor({ ...quiet, failed: [{ id: 'h9', error: 'boom' }], remarks: [remark] }, 3)
    expect(m?.subject).toContain('mal tourné')
    expect(m?.text).toContain('La liste ne se vide pas')
  })
  it('a remark line names the place and the row, never the household, and caps a long body', () => {
    const line = remarkLine({ ...remark, body: 'x'.repeat(900) })
    expect(line).toContain('(/liste · maisonnée hhX)')
    expect(line).toContain('x'.repeat(600) + '…')
    expect(line).not.toContain('x'.repeat(601))
    expect(remarkLine({ ...remark, body: '  ', seenPath: null })).toBe('[bug] La liste ne se vide pas\n(— · maisonnée hhX)')
  })
  it('the door counts ride in the Monday digest', () => {
    const m = alertFor({ ...quiet, door: { newHouseholds: 3, newConfirmed: 2, active: 5, stuckEmpty: 1 } }, 1)
    expect(m?.text).toContain('La porte (7 j) : 3 nouvelle(s) maisonnée(s) · 2 confirmée(s) · 5 active(s) · 1 restée(s) vide(s) après 3 jours')
  })
  it('no bucket alerts too', () => {
    expect(alertFor({ ...quiet, noBucket: true }, 3)?.text).toContain('AUCUNE sauvegarde')
  })
})
