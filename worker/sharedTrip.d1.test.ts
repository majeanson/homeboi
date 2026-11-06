import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// « VOYAGE PARTAGÉ » against a real D1 and R2: one trip that lives in NEITHER household, so
// the only thing authorizing a read or a write is a live membership row. Everything here
// is what that row decides, across two real households.

interface Trip {
  id: string
  title: string
  destination: string | null
  notes: string | null
  media_key: string | null
  members: { household_id: string; label: string; role: string }[]
  myRole: string
}
interface Note {
  id: string
  text: string
  label: string | null
  category: string
  author_household_id: string
  author_label: string
  media_kind: string | null
  media_key: string | null
  date: number | null
}
interface Item {
  id: string
  household_id: string
  bag_label: string | null
  text: string
  packed_at: number | null
}

const create = async (s: Session, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/shared-trip', { method: 'POST', body: { title: 'Gaspésie', ...body } }))).id
const list = async (s: Session) => (await okJson<{ trips: Trip[] }>(s.fetch('/api/shared-trip'))).trips
const one = (s: Session, id: string) => s.fetch(`/api/shared-trip?id=${id}`)
const trip = async (s: Session, id: string) => okJson<{ trip: Trip; myHouseholdId: string }>(one(s, id))
const token = async (s: Session, sharedTripId: string) =>
  new URL((await okJson<{ url: string }>(s.fetch('/api/shared-trip-invite', { method: 'POST', body: { id: sharedTripId, sharedTripId } }))).url).searchParams.get('j')!
const join = (s: Session, t: string) => s.fetch('/api/shared-trip-join', { method: 'POST', body: { token: t } })
const pair = async (label: string) => {
  const a = await household(`${label}-a`, undefined, { empty: true })
  const b = await household(`${label}-b`, undefined, { empty: true })
  const id = await create(a)
  await okJson(join(b, await token(a, id)))
  return { a, b, id }
}
const notes = async (s: Session, id: string) => (await okJson<{ notes: Note[] }>(s.fetch(`/api/shared-trip-notes?tripId=${id}`))).notes
const addNote = async (s: Session, tripId: string, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/shared-trip-notes', { method: 'POST', body: { tripId, ...body } }))).id
const bags = async (s: Session, id: string) => (await okJson<{ items: Item[] }>(s.fetch(`/api/shared-trip-packing?tripId=${id}`))).items
const pack = async (s: Session, tripId: string, text: string, bag_label?: string) => (await okJson<{ id: string }>(s.fetch('/api/shared-trip-packing', { method: 'POST', body: { tripId, text, bag_label } }))).id
const upload = async (s: Session, path: string, type = 'image/png') => (await okJson<{ key: string; kind: string }>(s.fetch(path, { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': type } })))
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('un voyage partagé', () => {
  it('is created by its owner, edited, and read by nobody else', async () => {
    const a = await household('st-crud-a', undefined, { empty: true })
    const other = await household('st-crud-b', undefined, { empty: true })
    const id = await create(a, { title: '  Gaspésie  ', destination: 'Percé' })
    const read = await trip(a, id)
    expect(read.myHouseholdId).toBe(a.householdId)
    expect(read.trip).toMatchObject({ title: 'Gaspésie', destination: 'Percé', myRole: 'owner' })
    expect(read.trip.members).toEqual([expect.objectContaining({ household_id: a.householdId, role: 'owner' })])
    expect((await list(a)).map((t) => t.id)).toEqual([id])

    await okJson(a.fetch('/api/shared-trip', { method: 'PATCH', body: { id, notes: ' départ à 6 h ' } }))
    expect((await trip(a, id)).trip).toMatchObject({ title: 'Gaspésie', notes: 'départ à 6 h' })

    expect((await one(other, id)).status, 'no membership, no trip').toBe(403)
    expect((await other.fetch('/api/shared-trip', { method: 'PATCH', body: { id, title: 'Volé' } })).status).toBe(403)
    expect((await other.fetch(`/api/shared-trip-notes?tripId=${id}`)).status).toBe(403)
    expect(await list(other)).toEqual([])
    expect((await a.fetch('/api/shared-trip', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
  })
})

describe('rejoindre', () => {
  it('a link previews the trip, joins as a member, and a re-click changes nothing', async () => {
    const a = await household('st-join-a', undefined, { empty: true })
    const b = await household('st-join-b', undefined, { empty: true })
    const id = await create(a, { destination: 'Percé' })
    const t = await token(a, id)
    expect(await okJson(b.fetch(`/api/shared-trip-join?j=${encodeURIComponent(t)}`))).toMatchObject({ title: 'Gaspésie', destination: 'Percé', members: 1 })

    await okJson(join(b, t))
    await okJson(join(b, t))
    const { trip: read } = await trip(b, id)
    expect(read.myRole).toBe('member')
    expect(read.members.map((m) => m.household_id).sort()).toEqual([a.householdId, b.householdId].sort())
    expect((await list(b)).map((x) => x.id)).toEqual([id])
  })

  it('a rotated link is dead, and a stranger cannot rotate one', async () => {
    const a = await household('st-rotate-a', undefined, { empty: true })
    const b = await household('st-rotate-b', undefined, { empty: true })
    const id = await create(a)
    const t = await token(a, id)
    expect((await b.fetch('/api/shared-trip-invite', { method: 'DELETE', body: { id, sharedTripId: id } })).status).toBe(403)
    await okJson(a.fetch('/api/shared-trip-invite', { method: 'DELETE', body: { id, sharedTripId: id } }))
    expect((await join(b, t)).status).toBe(404)
    expect((await one(b, id)).status).toBe(403)
  })

  it('a trip holds six households at most', async () => {
    const a = await household('st-cap', undefined, { empty: true })
    const id = await create(a)
    const t = await token(a, id)
    for (let i = 0; i < 5; i++) await okJson(join(await household(`st-cap-${i}`, undefined, { empty: true }), t))
    expect((await join(await household('st-cap-late', undefined, { empty: true }), t)).status).toBe(403)
  })
})

describe('ce qu’on y écrit ensemble', () => {
  it('a note is seen by both, stamped by the server, edited by either, and cleared', async () => {
    const { a, b, id } = await pair('st-notes')
    const n = await addNote(a, id, { text: ' Hôtel ', category: 'hotel', author_household_id: 'mensonge', author_label: 'Mensonge' })
    expect(await notes(b, id)).toEqual([expect.objectContaining({ id: n, text: 'Hôtel', category: 'hotel', author_household_id: a.householdId, author_label: 'Maisonnée st-notes-a' })])

    await okJson(b.fetch('/api/shared-trip-notes', { method: 'PATCH', body: { id: n, text: 'Hôtel Percé' } }))
    expect((await notes(a, id))[0].text, 'last write wins, any member').toBe('Hôtel Percé')

    await okJson(b.fetch('/api/shared-trip-notes', { method: 'DELETE', body: { id: n } }))
    expect(await notes(a, id)).toEqual([])
  })

  it('a dated activity reaches both households’ calendars', async () => {
    const { a, b, id } = await pair('st-month')
    const at = Math.floor(Date.now() / 1000) + 3 * 86400
    await addNote(a, id, { text: 'Rocher', date: at, category: 'activity' })
    for (const s of [a, b]) {
      const raw = await (await s.fetch(`/api/month?from=${at - 86400}&to=${at + 86400}`)).text()
      expect(raw).toContain('Rocher')
    }
  })

  it('bags belong to a household: mine are mine to change, yours I only read', async () => {
    const { a, b, id } = await pair('st-bags')
    const mine = await pack(a, id, 'Crème solaire', ' Zoé ')
    await pack(b, id, 'Tente')
    expect((await bags(b, id)).find((i) => i.id === mine), 'visible across households').toMatchObject({ household_id: a.householdId, bag_label: 'Zoé' })

    await b.fetch('/api/shared-trip-packing', { method: 'PATCH', body: { id: mine, packed: true } })
    await b.fetch('/api/shared-trip-packing', { method: 'DELETE', body: { id: mine } })
    expect((await bags(a, id)).find((i) => i.id === mine), 'b cannot tick or remove a’s item').toMatchObject({ packed_at: null })

    await okJson(a.fetch('/api/shared-trip-packing', { method: 'PATCH', body: { id: mine, packed: true } }))
    expect((await bags(a, id)).find((i) => i.id === mine)!.packed_at).toBeGreaterThan(0)
    await okJson(a.fetch('/api/shared-trip-packing', { method: 'DELETE', body: { id: mine } }))
    expect((await bags(a, id)).map((i) => i.text)).toEqual(['Tente'])
  })

  it('media goes to share-owned keys, and a cleared note frees them', async () => {
    const { a, b, id } = await pair('st-media')
    const doc = await upload(a, `/api/shared-trip-media?tripId=${id}`)
    const n = await addNote(a, id, { media_kind: 'image', media_key: doc.key })
    expect((await notes(b, id))[0]).toMatchObject({ media_kind: 'image', media_key: doc.key })
    await okJson(b.fetch('/api/shared-trip-notes', { method: 'DELETE', body: { id: n } }))
    expect(await stored(doc.key)).toBe(false)
  })
})

describe('partir', () => {
  it('a member leaves with a private copy of the trip, its own blobs, and its own bags; the trip lives on', async () => {
    const { a, b, id } = await pair('st-leave')
    const doc = await upload(a, `/api/shared-trip-media?tripId=${id}`)
    await addNote(a, id, { text: 'Hôtel', media_kind: 'image', media_key: doc.key })
    await pack(b, id, 'Tente')
    await pack(a, id, 'Crème solaire')

    const left = await okJson<{ id: string }>(b.fetch('/api/shared-trip-leave', { method: 'POST', body: { sharedTripId: id, keepCopy: true } }))
    expect((await one(b, id)).status, 'the grant is gone').toBe(403)
    expect((await trip(a, id)).trip.members.map((m) => m.household_id)).toEqual([a.householdId])
    expect(await stored(doc.key), 'the shared blob stays for the others').toBe(true)

    const copy = (await okJson<{ notes: { text: string; media_key: string | null; member_id: string | null }[] }>(b.fetch(`/api/trip-notes?tripId=${left.id}`))).notes
    expect(copy[0]).toMatchObject({ text: 'Hôtel', member_id: null })
    expect(copy[0].media_key, 'self-contained').not.toBe(doc.key)
    expect(await stored(copy[0].media_key!)).toBe(true)
    const items = (await okJson<{ items: { text: string }[] }>(b.fetch(`/api/trip-packing?tripId=${left.id}`))).items
    expect(items.map((i) => i.text), 'only this household’s bags return').toEqual(['Tente'])
  })

  it('the owner cannot leave; rejoining un-revokes', async () => {
    const { a, b, id } = await pair('st-owner')
    expect((await a.fetch('/api/shared-trip-leave', { method: 'POST', body: { sharedTripId: id } })).status).toBe(403)
    await okJson(b.fetch('/api/shared-trip-leave', { method: 'POST', body: { sharedTripId: id } }))
    await okJson(join(b, await token(a, id)))
    expect((await trip(b, id)).trip.myRole).toBe('member')
  })

  it('only the owner dissolves; every door closes and the blobs go', async () => {
    const { a, b, id } = await pair('st-dissolve')
    const doc = await upload(a, `/api/shared-trip-media?tripId=${id}`)
    await addNote(a, id, { media_kind: 'image', media_key: doc.key })
    expect((await b.fetch('/api/shared-trip', { method: 'DELETE', body: { id } })).status).toBe(403)
    expect((await trip(a, id)).trip.title).toBe('Gaspésie')

    await okJson(a.fetch('/api/shared-trip', { method: 'DELETE', body: { id } }))
    expect((await one(a, id)).status).toBe(404)
    expect((await one(b, id)).status).toBe(404)
    expect(await list(b)).toEqual([])
    expect(await stored(doc.key)).toBe(false)
  })
})

describe('promouvoir', () => {
  it('moves a private trip, notes and bags into the shared store, and the private one is gone', async () => {
    const a = await household('st-promote', undefined, { empty: true })
    const tripId = (await okJson<{ id: string }>(a.fetch('/api/trips', { method: 'POST', body: { title: 'Charlevoix' } }))).id
    await okJson(a.fetch('/api/trip-notes', { method: 'POST', body: { tripId, text: 'Auberge' } }))
    await okJson(a.fetch('/api/trip-packing', { method: 'POST', body: { tripId, text: 'Bottes' } }))

    const { id } = await okJson<{ id: string }>(a.fetch('/api/shared-trip', { method: 'POST', body: { fromTripId: tripId } }))
    expect((await trip(a, id)).trip).toMatchObject({ title: 'Charlevoix', myRole: 'owner' })
    expect((await notes(a, id)).map((n) => n.text)).toEqual(['Auberge'])
    expect((await bags(a, id)).map((i) => i.text)).toEqual(['Bottes'])

    const { trips } = await okJson<{ trips: { id: string }[] }>(a.fetch('/api/trips'))
    expect(trips.map((t) => t.id), 'one source of truth: a MOVE, not a copy').not.toContain(tripId)
  })

  it('cannot promote a stranger’s trip', async () => {
    const a = await household('st-promote-a', undefined, { empty: true })
    const b = await household('st-promote-b', undefined, { empty: true })
    const tripId = (await okJson<{ id: string }>(a.fetch('/api/trips', { method: 'POST', body: { title: 'À moi' } }))).id
    expect((await b.fetch('/api/shared-trip', { method: 'POST', body: { fromTripId: tripId } })).status).toBe(404)
    expect((await okJson<{ trips: { id: string }[] }>(a.fetch('/api/trips'))).trips.map((t) => t.id)).toEqual([tripId])
  })
})
