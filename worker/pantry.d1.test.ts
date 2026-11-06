import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// LE GARDE-MANGER against a real D1: three small lists that are deliberately NOT an
// inventory. « Ce qui s'achève », « À utiliser bientôt » and « La réserve » each record a
// fact and none of them may touch the shopping list on its own.

const listCount = async (s: Session) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM list_items WHERE household_id = ?').bind(s.householdId).first<{ n: number }>())!.n

describe('ce qui s’achève', () => {
  const low = async (s: Session) => (await okJson<{ low: { id: string; item: string; marked_at: number }[] }>(s.fetch('/api/pantry'))).low
  const add = (s: Session, item: string) => okJson<{ id: string }>(s.fetch('/api/pantry', { method: 'POST', body: { item } }))

  it('an item is marked, read back, renamed, and cleared, and the list never hears of it', async () => {
    const s = await household('pantry-crud', undefined, { empty: true })
    const { id } = await add(s, '  Beurre  ')
    expect(await low(s)).toEqual([expect.objectContaining({ id, item: 'Beurre' })])
    expect(await listCount(s), 'nothing reaches the list without a deliberate tap').toBe(0)

    await okJson(s.fetch('/api/pantry', { method: 'PATCH', body: { id, item: 'Beurre salé' } }))
    expect((await low(s))[0]).toMatchObject({ id, item: 'Beurre salé' })

    await okJson(s.fetch('/api/pantry', { method: 'DELETE', body: { id } }))
    expect(await low(s)).toEqual([])
  })

  it('refuses an empty item or rename, and a stranger’s id changes nothing', async () => {
    const s = await household('pantry-a', undefined, { empty: true })
    const other = await household('pantry-b', undefined, { empty: true })
    expect((await s.fetch('/api/pantry', { method: 'POST', body: { item: ' ' } })).status).toBe(400)
    const { id } = await add(s, 'Lait')
    expect((await s.fetch('/api/pantry', { method: 'PATCH', body: { id, item: ' ' } })).status).toBe(400)
    await okJson(other.fetch('/api/pantry', { method: 'PATCH', body: { id, item: 'Volé' } }))
    await okJson(other.fetch('/api/pantry', { method: 'DELETE', body: { id } }))
    expect((await low(s)).map((l) => l.item)).toEqual(['Lait'])
    expect(await low(other)).toEqual([])
  })

  it('reads newest first', async () => {
    const s = await household('pantry-order', undefined, { empty: true })
    const a = await add(s, 'Vieux')
    await add(s, 'Récent')
    await env.DB.prepare('UPDATE pantry_low SET marked_at = marked_at - 100 WHERE id = ?').bind(a.id).run()
    expect((await low(s)).map((l) => l.item)).toEqual(['Récent', 'Vieux'])
  })
})

describe('à utiliser bientôt', () => {
  const soon = async (s: Session) => (await okJson<{ soon: { id: string; item: string }[] }>(s.fetch('/api/use-soon'))).soon

  it('is marked, renamed, cleared, capped, and buys nothing', async () => {
    const s = await household('soon-crud', undefined, { empty: true })
    await okJson(s.fetch('/api/use-soon', { method: 'POST', body: { item: `  ${'x'.repeat(300)}  ` } }))
    const [row] = await soon(s)
    expect(row.item).toHaveLength(200)
    expect(await listCount(s)).toBe(0)

    await okJson(s.fetch('/api/use-soon', { method: 'PATCH', body: { id: row.id, item: 'Épinards' } }))
    expect((await soon(s))[0].item).toBe('Épinards')
    expect((await s.fetch('/api/use-soon', { method: 'PATCH', body: { id: row.id, item: ' ' } })).status).toBe(400)
    expect((await s.fetch('/api/use-soon', { method: 'POST', body: { item: ' ' } })).status).toBe(400)

    await okJson(s.fetch('/api/use-soon', { method: 'DELETE', body: { id: row.id } }))
    expect(await soon(s)).toEqual([])
  })

  it('stays in its household', async () => {
    const s = await household('soon-a', undefined, { empty: true })
    const other = await household('soon-b', undefined, { empty: true })
    await okJson(s.fetch('/api/use-soon', { method: 'POST', body: { item: 'Épinards' } }))
    const [row] = await soon(s)
    await okJson(other.fetch('/api/use-soon', { method: 'DELETE', body: { id: row.id } }))
    expect(await soon(s)).toHaveLength(1)
    expect(await soon(other)).toEqual([])
  })
})

describe('la réserve', () => {
  type Row = { id: string; item: string; location_id: string | null }
  const reserve = async (s: Session) => (await okJson<{ reserve: Row[] }>(s.fetch('/api/reserve'))).reserve
  const add = (s: Session, body: Record<string, unknown>) => okJson<{ id: string }>(s.fetch('/api/reserve', { method: 'POST', body }))
  const patch = (s: Session, body: Record<string, unknown>) => okJson(s.fetch('/api/reserve', { method: 'PATCH', body }))

  it('an item is stashed at a location, moved and renamed independently, and cleared', async () => {
    const s = await household('reserve-crud', undefined, { empty: true })
    const { id } = await add(s, { item: '  Bleuets  ', location_id: ' congelo ' })
    expect(await reserve(s)).toEqual([expect.objectContaining({ id, item: 'Bleuets', location_id: 'congelo' })])
    expect(await listCount(s), 'clearing or marking never touches the list').toBe(0)

    await patch(s, { id, location_id: 'garde-robe' })
    expect((await reserve(s))[0], 'a move leaves the name').toMatchObject({ item: 'Bleuets', location_id: 'garde-robe' })
    await patch(s, { id, item: 'Fraises' })
    expect((await reserve(s))[0], 'a rename leaves the spot').toMatchObject({ item: 'Fraises', location_id: 'garde-robe' })
    await patch(s, { id, location_id: null })
    expect((await reserve(s))[0].location_id).toBeNull()

    await okJson(s.fetch('/api/reserve', { method: 'DELETE', body: { id } }))
    expect(await reserve(s)).toEqual([])
  })

  it('refuses an empty name and a stranger’s id changes nothing', async () => {
    const s = await household('reserve-a', undefined, { empty: true })
    const other = await household('reserve-b', undefined, { empty: true })
    expect((await s.fetch('/api/reserve', { method: 'POST', body: { item: ' ' } })).status).toBe(400)
    const { id } = await add(s, { item: 'Bleuets' })
    expect((await s.fetch('/api/reserve', { method: 'PATCH', body: { id, item: ' ' } })).status).toBe(400)
    await patch(other, { id, item: 'Volé', location_id: 'ailleurs' })
    await okJson(other.fetch('/api/reserve', { method: 'DELETE', body: { id } }))
    expect(await reserve(s)).toEqual([expect.objectContaining({ item: 'Bleuets', location_id: null })])
  })

  it('a household’s own storage spots round-trip, and an explicit « none » sticks', async () => {
    const s = await household('reserve-spots', undefined, { empty: true })
    const read = async () => (await okJson<{ reserveLocations?: { id: string; name: string }[] }>(s.fetch('/api/household'))).reserveLocations
    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { reserveLocations: [{ id: 'congelo', name: 'Congélateur' }, { name: 'sans id' }] } }))
    expect((await read())!.map((l) => l.id)).toEqual(['congelo'])
    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { reserveLocations: [] } }))
    expect(await read(), 'the household’s « no locations » is not reverted to the defaults').toEqual([])
  })
})
