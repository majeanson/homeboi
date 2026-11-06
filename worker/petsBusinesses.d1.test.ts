import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// LES ANIMAUX ET LES COMMERCES against a real D1 and R2. Both soft-delete, both own a
// photo, and they meet twice: a pet's vet is a business, and a business shows which
// carnets it has serviced.

interface Pet {
  id: string
  name: string
  species: string | null
  breed: string | null
  photoKey: string | null
  colour: string | null
  birthday: string | null
  microchip: string | null
  feeding: string | null
  sitterNotes: string | null
  vetBusinessId: string | null
  weights: { date: string; kg: number; note?: string | null }[]
  notes: string | null
}
interface Biz {
  id: string
  name: string
  category: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  notes: string | null
  photoKey: string | null
  colour: string | null
  servicedCarnets: { id: string; name: string; kind: string }[]
}

const pets = async (s: Session) => (await okJson<{ pets: Pet[] }>(s.fetch('/api/pets'))).pets
const pet = async (s: Session, id: string) => (await pets(s)).find((p) => p.id === id)
const addPet = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/pets', { method: 'POST', body: { name: 'Rex', ...body } }))).id
const biz = async (s: Session) => (await okJson<{ businesses: Biz[] }>(s.fetch('/api/businesses'))).businesses
const addBiz = async (s: Session, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/businesses', { method: 'POST', body: { name: 'Clinique', ...body } }))).id
const photo = async (s: Session, path: string) => (await okJson<{ key: string }>(s.fetch(path, { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': 'image/jpeg' } }))).key
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('un animal', () => {
  it('is added, read A→Z, edited field by field, and soft-cleared with its photo', async () => {
    const s = await household('pets-crud', undefined, { empty: true })
    const key = await photo(s, '/api/pets')
    expect(key).toMatch(/^pet_/)
    const rex = await addPet(s, { name: '  rex  ', species: ' chien ', birthday: '2019-05-01', microchip: '123', feeding: ' 2 tasses ', sitterNotes: ' Peur du vacuum ', photoKey: key })
    await addPet(s, { name: 'Alfred' })
    expect((await pets(s)).map((p) => p.name), 'case does not change the alphabet').toEqual(['Alfred', 'rex'])
    expect(await pet(s, rex)).toMatchObject({ species: 'chien', birthday: '2019-05-01', microchip: '123', feeding: '2 tasses', sitterNotes: 'Peur du vacuum', photoKey: key })

    await okJson(s.fetch('/api/pets', { method: 'PATCH', body: { id: rex, breed: 'Beagle', microchip: null } }))
    expect(await pet(s, rex), 'only the keys sent change').toMatchObject({ breed: 'Beagle', microchip: null, species: 'chien' })
    expect((await s.fetch('/api/pets', { method: 'PATCH', body: { id: rex, name: ' ' } })).status).toBe(400)

    await okJson(s.fetch('/api/pets', { method: 'DELETE', body: { id: rex } }))
    expect(await pet(s, rex)).toBeUndefined()
    expect(await stored(key)).toBe(false)
    expect(await env.DB.prepare('SELECT 1 FROM pets WHERE id = ? AND deleted_at IS NOT NULL').bind(rex).first(), 'cleared, not erased').not.toBeNull()
    expect((await s.fetch('/api/pets', { method: 'PATCH', body: { id: rex, notes: 'Revenant' } })).status).toBe(404)
  })

  it('keeps a dated weight log, dropping any row that is not one', async () => {
    const s = await household('pets-weights', undefined, { empty: true })
    const id = await addPet(s, { weights: [{ date: '2026-01-01', kg: 12.5, note: ' vaccin ' }, { date: '', kg: 3 }, { date: '2026-02-01', kg: 'lourd' }, 'junk'] })
    expect((await pet(s, id))!.weights).toEqual([{ date: '2026-01-01', kg: 12.5, note: 'vaccin' }])
    await okJson(s.fetch('/api/pets', { method: 'PATCH', body: { id, weights: 'pas une liste' } }))
    expect((await pet(s, id))!.weights).toEqual([])
  })

  it('a swapped photo is freed; a stranger’s pet is a 404 and its photo stays', async () => {
    const s = await household('pets-a', undefined, { empty: true })
    const other = await household('pets-b', undefined, { empty: true })
    const first = await photo(s, '/api/pets')
    const id = await addPet(s, { photoKey: first })
    expect((await other.fetch('/api/pets', { method: 'PATCH', body: { id, notes: 'x' } })).status).toBe(404)
    await okJson(other.fetch('/api/pets', { method: 'DELETE', body: { id } }))
    expect(await stored(first)).toBe(true)
    expect(await pet(s, id)).toBeTruthy()

    const next = await photo(s, '/api/pets')
    await okJson(s.fetch('/api/pets', { method: 'PATCH', body: { id, photoKey: next } }))
    expect(await stored(first)).toBe(false)
    expect(await stored(next)).toBe(true)
  })

  it('points at its vet, and a pet is a person of the circle', async () => {
    const s = await household('pets-vet', undefined, { empty: true })
    const vet = await addBiz(s, { name: 'Vétérinaire du Lac', category: 'vet' })
    const id = await addPet(s, { vetBusinessId: vet })
    expect((await pet(s, id))!.vetBusinessId).toBe(vet)
    const { pets: inCircle } = await okJson<{ pets: { id: string; vetBusinessId: string }[] }>(s.fetch('/api/cercle'))
    expect(inCircle).toEqual([expect.objectContaining({ id, vetBusinessId: vet })])
  })
})

describe('un commerce', () => {
  it('is added, read A→Z, edited, and soft-cleared with its photo', async () => {
    const s = await household('biz-crud', undefined, { empty: true })
    const key = await photo(s, '/api/businesses')
    expect(key).toMatch(/^bz_/)
    const id = await addBiz(s, { name: '  plombier  ', category: ' maison ', phone: ' 418 555 0100 ', website: 'https://exemple.test', photoKey: key })
    await addBiz(s, { name: 'Boulangerie' })
    expect((await biz(s)).map((b) => b.name)).toEqual(['Boulangerie', 'plombier'])
    expect((await biz(s)).find((b) => b.id === id)).toMatchObject({ category: 'maison', phone: '418 555 0100', website: 'https://exemple.test', photoKey: key, servicedCarnets: [] })

    await okJson(s.fetch('/api/businesses', { method: 'PATCH', body: { id, phone: null, notes: ' ouvert le samedi ' } }))
    expect((await biz(s)).find((b) => b.id === id), 'only the keys sent change').toMatchObject({ phone: null, notes: 'ouvert le samedi', category: 'maison' })

    await okJson(s.fetch('/api/businesses', { method: 'DELETE', body: { id } }))
    expect((await biz(s)).map((b) => b.id)).not.toContain(id)
    expect(await stored(key)).toBe(false)
    expect((await s.fetch('/api/businesses', { method: 'PATCH', body: { id, notes: 'Revenant' } })).status).toBe(404)
  })

  it('refuses no name, caps long notes, and a stranger’s is a 404', async () => {
    const s = await household('biz-a', undefined, { empty: true })
    const other = await household('biz-b', undefined, { empty: true })
    expect((await s.fetch('/api/businesses', { method: 'POST', body: { name: ' ' } })).status).toBe(400)
    const id = await addBiz(s, { notes: 'x'.repeat(3000) })
    expect((await biz(s))[0].notes).toHaveLength(2000)
    expect((await other.fetch('/api/businesses', { method: 'PATCH', body: { id, name: 'Volé' } })).status).toBe(404)
    expect(await biz(other)).toEqual([])
  })

  it('shows the carnets it has serviced, once each, until that carnet is archived', async () => {
    const s = await household('biz-served', undefined, { empty: true })
    const id = await addBiz(s, { name: 'Plombier' })
    const heater = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Chauffe-eau', kind: 'appliance' } }))
    for (const title of ['Installation', 'Entretien']) await okJson(s.fetch('/api/care-log', { method: 'POST', body: { carnetId: heater.id, title, businessId: id } }))
    expect((await biz(s))[0].servicedCarnets).toEqual([{ id: heater.id, name: 'Chauffe-eau', kind: 'appliance' }])

    await okJson(s.fetch('/api/carnets', { method: 'DELETE', body: { id: heater.id } }))
    expect((await biz(s))[0].servicedCarnets).toEqual([])
  })

  it('a rendez-vous with a deleted business still reads', async () => {
    const s = await household('biz-event', undefined, { empty: true })
    const id = await addBiz(s, { name: 'Clinique' })
    const startAt = Math.floor(Date.now() / 1000) + 7200
    const ev = await okJson<{ id: string }>(s.fetch('/api/events', { method: 'POST', body: { title: 'Vaccin', startAt, businessId: id } }))
    await okJson(s.fetch('/api/businesses', { method: 'DELETE', body: { id } }))
    const { events } = await okJson<{ events: { title: string }[] }>(s.fetch(`/api/events?id=${ev.id}`))
    expect(events[0].title).toBe('Vaccin')
  })
})
