import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// « VOYAGE » against a real D1 and R2: the notebook, its one unified store of notes, the
// bags, and a soft delete that takes the trip's content along so a new trip inherits no
// orphan.

interface Trip {
  id: string
  title: string
  destination: string | null
  start_at: number | null
  end_at: number | null
  members: string[]
  media_kind: string | null
  media_key: string | null
  colour: string
  notes: string | null
}
interface Note {
  id: string
  trip_id: string
  category: string
  label: string | null
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  member_id: string | null
  date: number | null
  position: number
}
interface Item {
  id: string
  member_id: string | null
  text: string
  packed_at: number | null
}

const day = (n: number) => addLocalDays(localDayStart(new Date()), n)
const trips = async (s: Session) => (await okJson<{ trips: Trip[] }>(s.fetch('/api/trips'))).trips
const trip = async (s: Session, id: string) => (await trips(s)).find((t) => t.id === id)
const addTrip = async (s: Session, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/trips', { method: 'POST', body: { title: 'Gaspésie', ...body } }))).id
const notes = async (s: Session, tripId: string) => (await okJson<{ notes: Note[] }>(s.fetch(`/api/trip-notes?tripId=${tripId}`))).notes
const addNote = async (s: Session, tripId: string, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/trip-notes', { method: 'POST', body: { tripId, ...body } }))).id
const bag = async (s: Session, tripId: string) => (await okJson<{ items: Item[] }>(s.fetch(`/api/trip-packing?tripId=${tripId}`))).items
const pack = async (s: Session, tripId: string, text: string, member_id?: string) => (await okJson<{ id: string }>(s.fetch('/api/trip-packing', { method: 'POST', body: { tripId, text, member_id } }))).id
const patchBag = (s: Session, body: Record<string, unknown>) => okJson(s.fetch('/api/trip-packing', { method: 'PATCH', body }))
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const upload = async (s: Session, type: string) => okJson<{ key: string; kind: string }>(s.fetch('/api/trip-doc-media', { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': type } }))
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('un voyage', () => {
  it('is planned, read back soonest first, edited sparsely, and soft-deleted', async () => {
    const s = await household('trips-crud', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const later = await addTrip(s, { title: 'Plus tard', startAt: day(60) })
    const undated = await addTrip(s, { title: 'Un jour' })
    const soon = await addTrip(s, { title: '  Gaspésie  ', destination: ' Percé ', startAt: day(10), endAt: day(14), members: [lea, lea, '', 7], colour: '#112233' })

    expect((await trips(s)).map((t) => t.id), 'soonest first, the undated last').toEqual([soon, later, undated])
    expect(await trip(s, soon)).toMatchObject({ title: 'Gaspésie', destination: 'Percé', start_at: day(10), end_at: day(14), members: [lea], colour: '#112233' })

    await okJson(s.fetch('/api/trips', { method: 'PATCH', body: { id: soon, notes: ' valises ', endAt: null } }))
    expect(await trip(s, soon), 'only what was sent changes').toMatchObject({ title: 'Gaspésie', notes: 'valises', end_at: null, start_at: day(10) })
    expect((await s.fetch('/api/trips', { method: 'PATCH', body: { id: soon } })).status).toBe(400)

    await okJson(s.fetch('/api/trips', { method: 'DELETE', body: { id: soon } }))
    expect(await trip(s, soon)).toBeUndefined()
    expect(await env.DB.prepare('SELECT 1 FROM trips WHERE id = ? AND deleted_at IS NOT NULL').bind(soon).first()).not.toBeNull()
    expect((await s.fetch('/api/trips', { method: 'PATCH', body: { id: soon, title: 'Revenant' } })).status).toBe(404)
  })

  it('refuses no title; a stranger’s trip takes no edit, note, or bag item', async () => {
    const s = await household('trips-a', undefined, { empty: true })
    const other = await household('trips-b', undefined, { empty: true })
    expect((await s.fetch('/api/trips', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    const id = await addTrip(s)
    expect((await other.fetch('/api/trips', { method: 'PATCH', body: { id, title: 'Volé' } })).status).toBe(404)
    expect((await other.fetch('/api/trip-notes', { method: 'POST', body: { tripId: id, text: 'x' } })).status).toBe(404)
    expect((await other.fetch('/api/trip-packing', { method: 'POST', body: { tripId: id, text: 'x' } })).status).toBe(404)
    expect(await notes(other, id)).toEqual([])
    expect((await trip(s, id))?.title).toBe('Gaspésie')
  })

  it('a swapped cover frees the old one', async () => {
    const s = await household('trips-cover', undefined, { empty: true })
    const id = await addTrip(s)
    const first = await upload(s, 'image/jpeg')
    const second = await upload(s, 'image/jpeg')
    await okJson(s.fetch('/api/trips', { method: 'PATCH', body: { id, media_key: first.key } }))
    expect(await trip(s, id)).toMatchObject({ media_kind: 'image', media_key: first.key })
    await okJson(s.fetch('/api/trips', { method: 'PATCH', body: { id, media_key: second.key } }))
    expect(await stored(first.key)).toBe(false)
    await okJson(s.fetch('/api/trips', { method: 'DELETE', body: { id } }))
    expect(await stored(second.key)).toBe(false)
  })

  it('takes its notes and bags with it, so a new trip inherits nothing', async () => {
    const s = await household('trips-cascade', undefined, { empty: true })
    const id = await addTrip(s)
    await addNote(s, id, { text: 'Hôtel' })
    await pack(s, id, 'Crème solaire')
    await okJson(s.fetch('/api/trips', { method: 'DELETE', body: { id } }))
    expect(await notes(s, id)).toEqual([])
    expect(await bag(s, id)).toEqual([])
    expect((await s.fetch('/api/trip-notes', { method: 'POST', body: { tripId: id, text: 'tard' } })).status).toBe(404)
  })

  it('reaches the calendar over its dates', async () => {
    const s = await household('trips-month', undefined, { empty: true })
    await addTrip(s, { title: 'Mi-mois', startAt: day(3), endAt: day(5) })
    await addTrip(s, { title: 'Hors fenêtre', startAt: day(60), endAt: day(62) })
    const month = await okJson<{ trips: { title: string }[] }>(s.fetch(`/api/month?from=${day(0)}&to=${day(30)}`))
    expect(month.trips.map((t) => t.title)).toEqual(['Mi-mois'])
  })
})

describe('les notes de voyage', () => {
  it('a note is written, categorised, reordered by day, edited, and cleared', async () => {
    const s = await household('tnotes-crud', undefined, { empty: true })
    const id = await addTrip(s)
    const lea = await member(s, 'Léa')
    const info = await addNote(s, id, { text: ' Vol AC123 ', category: 'flight', label: ' Aller ', member_id: lea })
    const second = await addNote(s, id, { text: 'Musée', date: day(2) })
    const first = await addNote(s, id, { text: 'Plage', date: day(2), category: 'pas-une-categorie' })

    expect((await notes(s, id)).find((n) => n.id === info), 'a real category, a real face').toMatchObject({ category: 'flight', label: 'Aller', text: 'Vol AC123', member_id: lea })
    expect((await notes(s, id)).find((n) => n.id === first)!.category).toBe('general')
    expect((await notes(s, id)).at(-1)!.id, 'atemporal info comes after the itinerary').toBe(info)

    await okJson(s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: second, position: 1 } }))
    await okJson(s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: first, position: 0 } }))
    expect((await notes(s, id)).slice(0, 2).map((n) => n.text), 'the drag holds').toEqual(['Plage', 'Musée'])

    await okJson(s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: info, text: 'Vol AC456', date: day(1) } }))
    expect((await notes(s, id))[0], 'dating an info moves it onto the itinerary').toMatchObject({ id: info, text: 'Vol AC456', date: day(1) })
    expect((await s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: info } })).status).toBe(400)

    await okJson(s.fetch('/api/trip-notes', { method: 'DELETE', body: { id: info } }))
    expect((await notes(s, id)).map((n) => n.id)).not.toContain(info)
  })

  it('refuses an empty note, and a stranger’s member never becomes the scope', async () => {
    const s = await household('tnotes-a', undefined, { empty: true })
    const other = await household('tnotes-b', undefined, { empty: true })
    const id = await addTrip(s)
    expect((await s.fetch('/api/trip-notes', { method: 'POST', body: { tripId: id, text: ' ' } })).status).toBe(400)
    const n = await addNote(s, id, { text: 'x', member_id: await member(other, 'Zoé') })
    expect((await notes(s, id)).find((r) => r.id === n)!.member_id).toBeNull()
  })

  it('a document, a drawing and its re-draw: the kind comes from the file, old blobs are freed', async () => {
    const s = await household('tnotes-media', undefined, { empty: true })
    const id = await addTrip(s)
    const pdf = await upload(s, 'application/pdf')
    expect(pdf.kind).toBe('image')
    expect(pdf.key, 'the viewer tells a PDF from the key alone').toMatch(/^tn_.*\.pdf$/)
    const doc = await addNote(s, id, { media_kind: 'image', media_key: pdf.key, category: 'document' })
    expect((await s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: doc, media_key: 'tn_autre' } })).status, 'only a drawing is re-drawn').toBe(400)
    expect(await stored(pdf.key), 'a refused edit frees nothing').toBe(true)

    const png = await upload(s, 'image/png')
    const scene = await upload(s, 'application/json')
    expect(scene.kind).toBe('scene')
    const drawn = await addNote(s, id, { media_kind: 'drawing', media_key: png.key, scene_key: scene.key })
    const redrawn = await upload(s, 'image/png')
    await okJson(s.fetch('/api/trip-notes', { method: 'PATCH', body: { id: drawn, media_key: redrawn.key } }))
    expect(await stored(png.key)).toBe(false)
    expect(await stored(scene.key)).toBe(false)

    await okJson(s.fetch('/api/trip-notes', { method: 'DELETE', body: { id: doc } }))
    expect(await stored(pdf.key)).toBe(false)
  })
})

describe('les bagages', () => {
  it('an item is added to a bag, ticked in place, moved, renamed, and removed', async () => {
    const s = await household('packing-crud', undefined, { empty: true })
    const id = await addTrip(s)
    const lea = await member(s, 'Léa')
    const shared = await pack(s, id, '  Crème solaire  ')
    const hers = await pack(s, id, 'Doudou', lea)
    expect(await bag(s, id)).toEqual([expect.objectContaining({ id: shared, text: 'Crème solaire', member_id: null, packed_at: null }), expect.objectContaining({ id: hers, member_id: lea })])

    await patchBag(s, { id: shared, packed: true })
    expect((await bag(s, id))[0].packed_at).toBeGreaterThan(0)
    await patchBag(s, { id: shared, packed: false })
    expect((await bag(s, id))[0].packed_at).toBeNull()

    await patchBag(s, { id: hers, packed: true })
    expect((await bag(s, id))[1].member_id, 'a tick does not change whose bag it is').toBe(lea)
    await patchBag(s, { id: hers, member_id: null })
    expect((await bag(s, id))[1].member_id, 'moved to the shared list').toBeNull()
    await patchBag(s, { id: hers, text: 'Toutou' })
    expect((await bag(s, id))[1]).toMatchObject({ text: 'Toutou' })

    await okJson(s.fetch('/api/trip-packing', { method: 'DELETE', body: { id: hers } }))
    expect((await bag(s, id)).map((i) => i.id)).toEqual([shared])
  })

  it('« Effacer cochées » takes the ticked rows; with ids, exactly those ids, so a late tick survives', async () => {
    const s = await household('packing-clear', undefined, { empty: true })
    const id = await addTrip(s)
    const a = await pack(s, id, 'A')
    const b = await pack(s, id, 'B')
    const c = await pack(s, id, 'C')
    await patchBag(s, { id: a, packed: true })
    await patchBag(s, { id: b, packed: true })

    await patchBag(s, { tripId: id, clearChecked: true, ids: [a] })
    expect((await bag(s, id)).map((i) => i.text), 'b was ticked after the undo was scheduled').toEqual(['B', 'C'])

    await patchBag(s, { tripId: id, clearChecked: true })
    expect((await bag(s, id)).map((i) => i.id)).toEqual([c])
    await patchBag(s, { tripId: id, clearChecked: true, ids: [] })
    expect(await bag(s, id), 'an empty selection clears nothing').toHaveLength(1)
  })

  it('never reaches the board’s todos', async () => {
    const s = await household('packing-leak', undefined, { empty: true })
    await pack(s, await addTrip(s), 'Crème solaire')
    expect(await (await s.fetch('/api/board')).text()).not.toContain('Crème solaire')
    expect(await (await s.fetch('/api/todos')).text()).not.toContain('Crème solaire')
  })
})
