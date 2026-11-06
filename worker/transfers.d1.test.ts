import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// « LES VIREMENTS » against a real D1: a receipt for money that moved. Its lines must add
// up, it may only claim a plan the household owns, editing an agreement never rewrites a
// receipt, and a mistaken delete stays recoverable.

type Line = { kind: 'plan'; planId: string; dueAt: number; amountCents: number } | { kind: 'topup'; amountCents: number } | { kind: 'other'; label: string; amountCents: number }
interface Plan {
  id: string
  title: string
  amountCents: number | null
  recur: { freq: string } | null
  anchorAt: number
  shares: Record<string, number>
  catchup: { behindMemberId: string; gapCents: number; asOf: number; termEnd: number } | null
  colour: string | null
  position: number
  note: string | null
  due: number[]
  projection: unknown
}
interface Transfer {
  id: string
  memberId: string | null
  sentAt: number
  lines: Line[]
  totalCents: number
  memo: string
  reference: string | null
  note: string | null
}
interface Read {
  today: number
  more: boolean
  plans: Plan[]
  transfers: Transfer[]
}

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const read = (s: Session) => okJson<Read>(s.fetch('/api/transfers'))
const send = (s: Session, body: Record<string, unknown>) => s.fetch('/api/transfers', { method: 'POST', body })
const log = async (s: Session, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(send(s, { lines: [{ kind: 'topup', amountCents: 5000 }], ...body }))).id
const patch = (s: Session, body: Record<string, unknown>) => s.fetch('/api/transfers', { method: 'PATCH', body })
const plan = async (s: Session, body: Record<string, unknown> = {}) =>
  (await okJson<{ id: string }>(s.fetch('/api/transfer-plans', { method: 'POST', body: { title: 'Hypothèque', amountCents: 200000, anchorAt: day(-14), recur: { freq: 'weekly', interval: 2 }, ...body } }))).id
const planOf = async (s: Session, id: string) => (await read(s)).plans.find((p) => p.id === id)

describe('un virement', () => {
  it('is logged, read with a summed total, completed with its reference, and soft-deleted', async () => {
    const s = await household('transfers-crud', undefined, { empty: true })
    const id = await log(s, {
      memberId: 'marc',
      sentAt: day(-1),
      memo: '  Août  ',
      lines: [{ kind: 'topup', amountCents: 5000 }, { kind: 'other', label: ' Garderie ', amountCents: 12550 }],
    })
    expect((await read(s)).transfers).toEqual([
      expect.objectContaining({ id, memberId: 'marc', sentAt: day(-1), memo: 'Août', reference: null, totalCents: 17550, lines: [{ kind: 'topup', amountCents: 5000 }, { kind: 'other', label: 'Garderie', amountCents: 12550 }] }),
    ])

    await okJson(patch(s, { id, reference: ' CA12345 ' }))
    expect((await read(s)).transfers[0], 'the reference lands later, the rest stays').toMatchObject({ reference: 'CA12345', memo: 'Août', totalCents: 17550 })
    await okJson(patch(s, { id, reference: null }))
    expect((await read(s)).transfers[0].reference, 'null is how a client clears it').toBeNull()

    await okJson(s.fetch('/api/transfers', { method: 'DELETE', body: { id } }))
    expect((await read(s)).transfers).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM transfers WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first(), 'a money record stays recoverable').not.toBeNull()
    expect((await s.fetch('/api/transfers', { method: 'DELETE', body: { id } })).status, 'and is not deleted twice').toBe(404)
    expect((await patch(s, { id, memo: 'Revenant' })).status).toBe(404)
  })

  it('a date left out is today', async () => {
    const s = await household('transfers-today', undefined, { empty: true })
    await log(s)
    expect((await read(s)).transfers[0].sentAt).toBe(today())
  })

  it('refuses any line that does not add up, whole, rather than storing part of it', async () => {
    const s = await household('transfers-lines', undefined, { empty: true })
    const bad: unknown[] = [
      [],
      'pas une liste',
      [{ kind: 'topup', amountCents: -1 }],
      [{ kind: 'topup', amountCents: 100_000_001 }],
      [{ kind: 'topup', amountCents: 'beaucoup' }],
      [{ kind: 'mystère', amountCents: 10 }],
      [{ kind: 'topup', amountCents: 10 }, { kind: 'plan', planId: 'nope', dueAt: day(1), amountCents: 10 }],
      Array.from({ length: 21 }, () => ({ kind: 'topup', amountCents: 1 })),
    ]
    for (const lines of bad) expect((await send(s, { lines })).status, JSON.stringify(lines).slice(0, 50)).toBe(400)
    expect((await read(s)).transfers).toEqual([])

    const id = await log(s)
    expect((await patch(s, { id, lines: [] })).status).toBe(400)
    expect((await patch(s, { id, sentAt: 'hier' })).status).toBe(400)
    expect((await read(s)).transfers[0].totalCents, 'a refused edit leaves the receipt').toBe(5000)
  })

  it('a line may not claim another household’s plan, and a stranger cannot touch the receipt', async () => {
    const s = await household('transfers-a', undefined, { empty: true })
    const other = await household('transfers-b', undefined, { empty: true })
    const theirs = await plan(other)
    expect((await send(s, { lines: [{ kind: 'plan', planId: theirs, dueAt: day(1), amountCents: 100 }] })).status).toBe(400)

    const id = await log(s)
    expect((await patch(other, { id, memo: 'Volé' })).status).toBe(404)
    expect((await other.fetch('/api/transfers', { method: 'DELETE', body: { id } })).status).toBe(404)
    expect((await read(s)).transfers).toHaveLength(1)
    expect((await read(other)).transfers).toEqual([])
  })
})

describe('une entente', () => {
  it('is written, read through /api/transfers, edited, and retired without touching its receipts', async () => {
    const s = await household('plans-crud', undefined, { empty: true })
    const id = await plan(s, { title: '  Hypothèque  ', shares: { lea: 120000, marc: 80000, vide: 'x' }, colour: '#123456', note: ' notre entente ' })
    const made = (await planOf(s, id))!
    expect(made).toMatchObject({ title: 'Hypothèque', amountCents: 200000, shares: { lea: 120000, marc: 80000 }, colour: '#123456', note: 'notre entente', position: 0, catchup: null })
    expect(made.due.length, 'due dates are expanded server-side').toBeGreaterThan(1)
    expect(made.due, 'plain, ascending local midnights').toEqual([...made.due].sort((a, b) => a - b))
    expect(made.due.every((d) => d === localDayStart(new Date(d * 1000)))).toBe(true)

    const second = await plan(s, { title: 'Garderie' })
    expect((await planOf(s, second))!.position, 'appended').toBe(1)

    const receipt = await log(s, { lines: [{ kind: 'plan', planId: id, dueAt: made.due[0], amountCents: 120000 }] })
    await okJson(s.fetch('/api/transfer-plans', { method: 'PATCH', body: { id, amountCents: 999999, shares: { lea: 1 }, note: null, recur: null } }))
    const edited = (await planOf(s, id))!
    expect(edited).toMatchObject({ amountCents: 999999, shares: { lea: 1 }, note: null, recur: null })
    expect((await read(s)).transfers.find((t) => t.id === receipt)!.totalCents, 'raising a share leaves last year’s receipts as they were').toBe(120000)

    await okJson(s.fetch('/api/transfer-plans', { method: 'DELETE', body: { id } }))
    expect(await planOf(s, id)).toBeUndefined()
    expect((await read(s)).transfers[0].lines[0], 'a receipt stays true after the agreement ends').toMatchObject({ kind: 'plan', planId: id })
    expect((await send(s, { lines: [{ kind: 'plan', planId: id, dueAt: day(1), amountCents: 1 }] })).status, 'but it takes no new claims').toBe(400)
  })

  it('needs a title and a date; a half-built catch-up is no catch-up; a good one projects', async () => {
    const s = await household('plans-catchup', undefined, { empty: true })
    expect((await s.fetch('/api/transfer-plans', { method: 'POST', body: { anchorAt: day(0) } })).status).toBe(400)
    expect((await s.fetch('/api/transfer-plans', { method: 'POST', body: { title: 'X' } })).status).toBe(400)

    const half = await plan(s, { catchup: { behindMemberId: 'marc' } })
    expect((await planOf(s, half))!.catchup).toBeNull()

    const shares = { lea: 100000, marc: 150000 }
    const whole = await plan(s, { shares, catchup: { behindMemberId: 'marc', gapCents: 500000, asOf: day(-30), termEnd: day(300) } })
    const read1 = (await planOf(s, whole))!
    expect(read1.catchup).toMatchObject({ behindMemberId: 'marc', gapCents: 500000 })
    expect(read1.projection, 'read off the agreement, not stored').toBeTruthy()
  })

  it('a stranger’s plan is a 404', async () => {
    const s = await household('plans-a', undefined, { empty: true })
    const other = await household('plans-b', undefined, { empty: true })
    const id = await plan(s)
    expect((await other.fetch('/api/transfer-plans', { method: 'PATCH', body: { id, title: 'Volée' } })).status).toBe(404)
    expect((await other.fetch('/api/transfer-plans', { method: 'DELETE', body: { id } })).status).toBe(404)
    expect((await planOf(s, id))!.title).toBe('Hypothèque')
  })

  it('a due date reaches the calendar, and a covered one reads as covered', async () => {
    const s = await household('plans-month', undefined, { empty: true })
    const id = await plan(s, { title: 'Loyer', anchorAt: day(1), recur: { freq: 'weekly', interval: 2 } })
    const month = await okJson<{ transfers: { planId?: string; title?: string; date?: number }[] }>(s.fetch(`/api/month?from=${day(0)}&to=${day(30)}`))
    expect(JSON.stringify(month.transfers)).toContain('Loyer')
    expect(id).toBeTruthy()
  })
})
