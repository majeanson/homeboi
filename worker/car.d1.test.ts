import { describe, it, expect } from 'vitest'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayOfWeek, localDayStart } from '../functions/_lib/ids'

// « L'AUTO » against a real D1: a weekly template of who holds the car, a per-date
// override that replaces it for one day, and the one resolved read every surface shares.

interface Block {
  id: string
  memberId: string
  label: string | null
  startMin: number
  endMin: number
  weekdays: number[]
  holdsCar: boolean
  color: string | null
  weekInterval: number
  anchorDay: number | null
}
interface Day {
  day: number
  spans: unknown[]
  carSpans: unknown[]
  rides: { id: string; title: string; conflict: boolean; passengers: string[] }[]
  override: { free?: boolean; label?: string | null } | null
}
interface Car {
  cars: { id: string; name: string }[]
  primaryCarId: string | null
  hasSchedule: boolean
  today: number
  status: { free: boolean }
  membersOut: unknown[]
  days: Day[]
}

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const dow = (d: number) => localDayOfWeek(new Date(d * 1000))
const blocks = async (s: Session) => (await okJson<{ blocks: Block[] }>(s.fetch('/api/schedule'))).blocks
const add = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/schedule', { method: 'POST', body }))).id
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const withCar = async (s: Session) => okJson(s.fetch('/api/household', { method: 'PATCH', body: { cars: [{ id: 'auto', name: 'La Corolla' }] } }))
const range = (s: Session, from: number, to: number) => okJson<Car>(s.fetch(`/api/car?from=${from}&to=${to}`))
const allWeek = [0, 1, 2, 3, 4, 5, 6]

describe('l’horaire', () => {
  it('a block is created, read in order, replaced whole, and removed', async () => {
    const s = await household('schedule-crud', undefined, { empty: true })
    const marc = await member(s, 'Marc')
    const late = await add(s, { memberId: marc, startMin: 780, endMin: 1020, weekdays: [1, 1, 3, 9] })
    const id = await add(s, { memberId: marc, label: '  Bureau  ', startMin: 480, endMin: 720, weekdays: [5, 1], color: '#ABCDEF' })
    expect((await blocks(s)).map((b) => b.id), 'by start of day').toEqual([id, late])
    expect((await blocks(s))[0]).toMatchObject({ label: 'Bureau', weekdays: [1, 5], color: '#abcdef', holdsCar: true, weekInterval: 1, anchorDay: null })
    expect((await blocks(s))[1].weekdays, 'deduped, in range').toEqual([1, 3])

    await okJson(s.fetch('/api/schedule', { method: 'PATCH', body: { id, memberId: marc, startMin: 540, endMin: 600, weekdays: [2], holdsCar: false } }))
    expect((await blocks(s))[0]).toMatchObject({ id, startMin: 540, label: null, weekdays: [2], holdsCar: false, color: null })

    await okJson(s.fetch('/api/schedule', { method: 'DELETE', body: { id } }))
    expect((await blocks(s)).map((b) => b.id)).toEqual([late])
  })

  it('needs a person and a real window; a stranger’s block is a 404', async () => {
    const s = await household('schedule-a', undefined, { empty: true })
    const other = await household('schedule-b', undefined, { empty: true })
    const marc = await member(s, 'Marc')
    expect((await s.fetch('/api/schedule', { method: 'POST', body: { startMin: 480, endMin: 600 } })).status).toBe(400)
    expect((await s.fetch('/api/schedule', { method: 'POST', body: { memberId: marc, startMin: 600, endMin: 600 } })).status, 'an end at the start is no window').toBe(400)
    const id = await add(s, { memberId: marc, startMin: 480, endMin: 600, weekdays: [1] })
    expect((await other.fetch('/api/schedule', { method: 'PATCH', body: { id, memberId: marc, startMin: 0, endMin: 1 } })).status).toBe(404)
    await okJson(other.fetch('/api/schedule', { method: 'DELETE', body: { id } }))
    expect(await blocks(s)).toHaveLength(1)
  })

  it('an every-N-weeks rota phases from this week, and an edit does not re-phase it', async () => {
    const s = await household('schedule-rota', undefined, { empty: true })
    const marc = await member(s, 'Marc')
    const id = await add(s, { memberId: marc, startMin: 480, endMin: 600, weekdays: [1], weekInterval: 2 })
    const [made] = await blocks(s)
    expect(made.weekInterval).toBe(2)
    expect(dow(made.anchorDay!), 'the start of a local week').toBe(0)

    await okJson(s.fetch('/api/schedule', { method: 'PATCH', body: { id, memberId: marc, startMin: 500, endMin: 600, weekdays: [1], weekInterval: 2, anchorDay: made.anchorDay! - 7 * 86400 } }))
    expect((await blocks(s))[0].anchorDay, 'a rota kept off this week stays off it').toBe(made.anchorDay! - 7 * 86400)
    await okJson(s.fetch('/api/schedule', { method: 'PATCH', body: { id, memberId: marc, startMin: 500, endMin: 600, weekdays: [1], weekInterval: 99 } }))
    expect((await blocks(s))[0].weekInterval, 'a two-month rota is the ceiling').toBe(8)
  })
})

describe('où est l’auto', () => {
  it('no car and no schedule is a free car, and today is always in the read', async () => {
    const s = await household('car-empty', undefined, { empty: true })
    const car = await okJson<Car>(s.fetch('/api/car'))
    expect(car).toMatchObject({ hasSchedule: false, status: { free: true }, membersOut: [] })
    expect(car.days.map((d) => d.day), 'a missing param means today, never day zero').toEqual([today()])
  })

  it('a block that holds the car makes the day busy; one that does not leaves it free', async () => {
    const s = await household('car-busy', undefined, { empty: true })
    await withCar(s)
    const marc = await member(s, 'Marc')
    const d = day(1)
    await add(s, { memberId: marc, label: 'Bureau', startMin: 480, endMin: 1020, weekdays: [dow(d)] })
    const [held] = (await range(s, d, day(2))).days
    expect(held.carSpans.length).toBe(1)

    const [id] = (await blocks(s)).map((b) => b.id)
    await okJson(s.fetch('/api/schedule', { method: 'PATCH', body: { id, memberId: marc, startMin: 480, endMin: 1020, weekdays: [dow(d)], holdsCar: false } }))
    expect((await range(s, d, day(2))).days[0].carSpans, 'he took the bus').toEqual([])
  })

  it('a rendez-vous taking the car while it is out is a conflict; one outside the window is not', async () => {
    const s = await household('car-conflict', undefined, { empty: true })
    await withCar(s)
    const marc = await member(s, 'Marc')
    const d = day(1)
    await add(s, { memberId: marc, startMin: 480, endMin: 1020, weekdays: [dow(d)] })
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Dentiste', startAt: d + 10 * 3600, carId: 'auto' } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Soir', startAt: d + 20 * 3600, carId: 'auto', passengers: [marc] } }))
    const { rides } = (await range(s, d, day(2))).days[0]
    expect(rides.find((r) => r.title === 'Dentiste')!.conflict).toBe(true)
    expect(rides.find((r) => r.title === 'Soir')).toMatchObject({ conflict: false, passengers: [marc] })
  })
})

describe('une journée ajustée', () => {
  it('« reste à la maison » replaces the template for that day only, and deleting it reverts', async () => {
    const s = await household('carday-free', undefined, { empty: true })
    await withCar(s)
    const marc = await member(s, 'Marc')
    const d = day(1)
    await add(s, { memberId: marc, startMin: 480, endMin: 1020, weekdays: allWeek })
    await okJson(s.fetch('/api/car-day', { method: 'POST', body: { carId: 'auto', day: d, free: true } }))

    const [adjusted, next] = (await range(s, d, day(3))).days
    expect(adjusted.carSpans, 'the car stays home').toEqual([])
    expect(adjusted.override).toMatchObject({ free: true })
    expect(next.carSpans, 'the template still rules the next day').toHaveLength(1)

    await okJson(s.fetch('/api/car-day', { method: 'DELETE', body: { carId: 'auto', day: d } }))
    const [back] = (await range(s, d, day(2))).days
    expect(back.override).toBeNull()
    expect(back.carSpans).toHaveLength(1)
  })

  it('a second adjustment of the same day replaces the first', async () => {
    const s = await household('carday-upsert', undefined, { empty: true })
    await withCar(s)
    const marc = await member(s, 'Marc')
    const d = day(2)
    await okJson(s.fetch('/api/car-day', { method: 'POST', body: { carId: 'auto', day: d, holderId: marc, startMin: 540, endMin: 600, label: ' Garage ' } }))
    await okJson(s.fetch('/api/car-day', { method: 'POST', body: { carId: 'auto', day: d, holderId: marc, startMin: 600, endMin: 660, label: 'Épicerie' } }))
    const [row] = (await range(s, d, day(3))).days
    expect(row.override).toMatchObject({ label: 'Épicerie' })
    expect(row.carSpans).toHaveLength(1)
  })

  it('refuses a missing car or day, and stays in its household', async () => {
    const s = await household('carday-a', undefined, { empty: true })
    const other = await household('carday-b', undefined, { empty: true })
    await withCar(s)
    await withCar(other)
    expect((await s.fetch('/api/car-day', { method: 'POST', body: { day: day(1) } })).status).toBe(400)
    expect((await s.fetch('/api/car-day', { method: 'POST', body: { carId: 'auto' } })).status).toBe(400)
    await okJson(s.fetch('/api/car-day', { method: 'POST', body: { carId: 'auto', day: day(1), free: true } }))
    await okJson(other.fetch('/api/car-day', { method: 'DELETE', body: { carId: 'auto', day: day(1) } }))
    expect((await range(s, day(1), day(2))).days[0].override, 'the same car id elsewhere is another car').toMatchObject({ free: true })
    expect((await range(other, day(1), day(2))).days[0].override).toBeNull()
  })
})
