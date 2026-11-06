import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// LES RENDEZ-VOUS against a real D1: the agenda's CRUD, the normalizers that decide what
// a saved rendez-vous MEANS (« Avec » is one answer, a window is under a day, a ride is a
// clean list), and the two reads a household sees it through.

interface Ev {
  id: string
  title: string
  start_at: number
  all_day: number
  end_at: number | null
  member_id: string | null
  contact_id: string | null
  business_id: string | null
  business_name: string | null
  recur_json: string | null
  lead_seconds: number | null
  car_id: string | null
  passengers: string | null
  notes: string | null
}

const inDays = (n: number, hours = 9) => addLocalDays(localDayStart(new Date()), n) + hours * 3600
const list = async (s: Session) => (await okJson<{ events: Ev[] }>(s.fetch('/api/events'))).events
const byId = async (s: Session, id: string) => (await okJson<{ events: Ev[] }>(s.fetch(`/api/events?id=${id}`))).events[0]
const add = (s: Session, body: Record<string, unknown>) =>
  okJson<{ id: string; title: string }>(s.fetch('/api/events', { method: 'POST', body: { title: 'Dentiste', startAt: inDays(2), ...body } }))
const edit = (s: Session, body: Record<string, unknown>) => s.fetch('/api/events', { method: 'PATCH', body })

describe('les rendez-vous', () => {
  it('a rendez-vous is born, is read back, changes, and is gone', async () => {
    const s = await household('events-crud', undefined, { empty: true })
    const start = inDays(3)
    const { id } = await add(s, { title: '  Dentiste  ', startAt: start, notes: ' carte d’assurance ' })

    const made = await byId(s, id)
    expect(made).toMatchObject({ title: 'Dentiste', start_at: start, all_day: 0, notes: 'carte d’assurance' })
    expect((await list(s)).map((e) => e.id), 'the agenda holds it').toEqual([id])

    await okJson(edit(s, { id, title: 'Orthodontiste', startAt: start + 3600, allDay: true }))
    expect(await byId(s, id)).toMatchObject({ title: 'Orthodontiste', start_at: start + 3600, all_day: 1, notes: null })

    await okJson(s.fetch('/api/events', { method: 'DELETE', body: { id } }))
    expect(await byId(s, id), 'gone by id').toBeUndefined()
    expect(await list(s)).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM events WHERE id = ?').bind(id).first()).toBeNull()
  })

  it('refuses a rendez-vous with no title or no date, and writes nothing', async () => {
    const s = await household('events-bad', undefined, { empty: true })
    expect((await s.fetch('/api/events', { method: 'POST', body: { title: '   ', startAt: inDays(1) } })).status).toBe(400)
    expect((await s.fetch('/api/events', { method: 'POST', body: { title: 'Sans date' } })).status).toBe(400)
    expect(await list(s)).toEqual([])
  })

  it('editing someone else’s rendez-vous is a 404 and changes nothing', async () => {
    const mine = await household('events-a', undefined, { empty: true })
    const other = await household('events-b', undefined, { empty: true })
    const start = inDays(1)
    const { id } = await add(mine, { title: 'À moi', startAt: start })
    expect((await edit(other, { id, title: 'Volé', startAt: start })).status).toBe(404)
    expect((await byId(mine, id))?.title).toBe('À moi')
    expect(await byId(other, id), 'and the stranger cannot read it').toBeUndefined()
    await okJson(other.fetch('/api/events', { method: 'DELETE', body: { id } }))
    expect((await byId(mine, id))?.title, 'nor delete it').toBe('À moi')
  })

  it('« Avec » is one answer — a business wins over a contact, and it never clears « Qui »', async () => {
    const s = await household('events-who', undefined, { empty: true })
    const biz = await okJson<{ id: string }>(s.fetch('/api/businesses', { method: 'POST', body: { name: 'Clinique du Parc' } }))
    const lea = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const tante = await okJson<{ id: string }>(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Tante' } }))
    const { id } = await add(s, { businessId: biz.id, contactId: tante.id, memberId: lea.id })
    const row = (await byId(s, id))!
    expect(row?.business_id).toBe(biz.id)
    expect(row.business_name, 'the join names the business on the read').toBe('Clinique du Parc')
    expect(row.contact_id, 'exactly one external counterpart').toBeNull()
    expect(row.member_id, 'the vet is still FOR someone').toBe(lea.id)

    // Dropping the business lets the contact take the seat.
    await okJson(edit(s, { id, title: row.title, startAt: row.start_at, contactId: tante.id, memberId: lea.id }))
    expect(await byId(s, id)).toMatchObject({ business_id: null, contact_id: tante.id, member_id: lea.id })
  })

  it('a window is under a day, after the start, and means nothing on an all-day event', async () => {
    const s = await household('events-window', undefined, { empty: true })
    const start = inDays(2)
    const endOf = async (endAt: unknown, allDay = false) => (await byId(s, (await add(s, { startAt: start, endAt, allDay })).id))!.end_at
    expect(await endOf(start + 5400), 'ninety minutes is a window').toBe(start + 5400)
    expect(await endOf(start + 24 * 3600), 'exactly a day still is').toBe(start + 24 * 3600)
    expect(await endOf(start + 24 * 3600 + 1), 'a span past a day is a Voyage, not an event').toBeNull()
    expect(await endOf(start), 'an end at the start is no window').toBeNull()
    expect(await endOf(start - 60)).toBeNull()
    expect(await endOf(start + 3600, true), 'the day already IS the window').toBeNull()
  })

  it('a ride is a clean list, a reminder is capped at the week, a note is capped', async () => {
    const s = await household('events-ride', undefined, { empty: true })
    const { id } = await add(s, {
      carId: '  auto-1  ',
      passengers: ['a', ' a ', 'b', 7, '', ...Array.from({ length: 20 }, (_, i) => `k${i}`)],
      leadSeconds: 30 * 86400,
      notes: 'x'.repeat(2500),
    })
    const row = (await byId(s, id))!
    expect(row?.car_id).toBe('auto-1')
    const riders = JSON.parse(row.passengers!) as string[]
    expect(riders.slice(0, 3), 'deduped, trimmed, strings only').toEqual(['a', 'b', 'k0'])
    expect(riders).toHaveLength(12)
    expect(row.lead_seconds, 'a longer lead has nothing to highlight against').toBe(7 * 86400)
    expect(row?.notes).toHaveLength(2000)

    await okJson(edit(s, { id, title: row.title, startAt: row.start_at, carId: '   ', passengers: [], leadSeconds: 0, notes: '  ' }))
    expect(await byId(s, id), 'each one clears back to « not set », never a blank string').toMatchObject({
      car_id: null,
      passengers: null,
      lead_seconds: null,
      notes: null,
    })
  })

  it('a past one-off leaves the agenda but stays reachable; a recurring series with a past anchor stays', async () => {
    const s = await household('events-past', undefined, { empty: true })
    const past = await add(s, { title: 'Hier', startAt: inDays(-2) })
    const weekly = await add(s, { title: 'Bac bleu', startAt: inDays(-30), recur: { freq: 'weekly', weekdays: [3] } })
    const future = await add(s, { title: 'Demain', startAt: inDays(1) })

    expect((await list(s)).map((e) => e.title), 'ordered by start, the anchor first').toEqual(['Bac bleu', 'Demain'])
    expect((await byId(s, past.id))?.title, 'the peek still finds a past rendez-vous by id').toBe('Hier')
    expect(JSON.parse((await byId(s, weekly.id))!.recur_json!)).toMatchObject({ freq: 'weekly' })
    expect(future.id).toBeTruthy()
  })

  it('a recurring event lands on every matching day of the calendar month; a one-off on its own', async () => {
    const s = await household('events-month', undefined, { empty: true })
    const from = addLocalDays(localDayStart(new Date()), 1)
    const to = addLocalDays(from, 21)
    await add(s, { title: 'Soccer', startAt: from + 18 * 3600, recur: { freq: 'weekly' } })
    await add(s, { title: 'Vaccin', startAt: from + 10 * 86400 + 3600 })
    await add(s, { title: 'Hors fenêtre', startAt: addLocalDays(from, 30) })

    const month = await okJson<{ events: { title: string }[] }>(s.fetch(`/api/month?from=${from}&to=${to}`))
    const titles = month.events.map((e) => e.title)
    expect(titles.filter((t) => t === 'Soccer'), 'three weeks, three practices').toHaveLength(3)
    expect(titles.filter((t) => t === 'Vaccin')).toHaveLength(1)
    expect(titles, 'the window bounds the read').not.toContain('Hors fenêtre')
  })

  it('today’s rendez-vous reaches the board', async () => {
    const s = await household('events-board', undefined, { empty: true })
    await add(s, { title: 'Répétition', startAt: inDays(0, 23) })
    const raw = await (await s.fetch('/api/board')).text()
    expect(raw).toContain('Répétition')
  })
})
