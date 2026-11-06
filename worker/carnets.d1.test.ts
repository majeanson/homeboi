import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// « LES CARNETS » against a real D1 and R2: a tree of cared-for things, its reversible
// archive, the service history of each one, and the house map a sitter reads.

interface Carnet {
  id: string
  parentId: string | null
  kind: string
  name: string
  mediaKey: string | null
  color: string
  facts: Record<string, unknown> | null
  installedAt: number | null
  lifespanMonths: number | null
  linkId: string | null
  notes: string | null
  sort: number
}
interface Entry {
  id: string
  carnetId: string
  at: number
  kind: string
  title: string
  note: string | null
  costCents: number | null
  businessId: string | null
  mediaKeys: string[]
}
interface Pin {
  id: string
  carnetId: string
  kind: string
  label: string
  detail: string | null
  mediaKey: string | null
  sort: number
}

const read = (s: Session, q = '') => okJson<{ carnets: Carnet[]; soon: { carnetId?: string; id?: string; name?: string }[] }>(s.fetch(`/api/carnets${q}`))
const one = async (s: Session, id: string) => (await read(s)).carnets.find((c) => c.id === id)
const add = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Maison', kind: 'home', ...body } }))).id
const patch = (s: Session, body: Record<string, unknown>) => s.fetch('/api/carnets', { method: 'PATCH', body })
const archive = (s: Session, id: string) => s.fetch('/api/carnets', { method: 'DELETE', body: { id } })
const log = async (s: Session, carnetId: string, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/care-log', { method: 'POST', body: { carnetId, title: 'Entretien', ...body } }))).id
const entries = async (s: Session, q = '') => (await okJson<{ entries: Entry[] }>(s.fetch(`/api/care-log${q}`))).entries
const pins = async (s: Session, q = '') => (await okJson<{ pins: Pin[] }>(s.fetch(`/api/home-pins${q}`))).pins
const pin = async (s: Session, carnetId: string, body: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/home-pins', { method: 'POST', body: { carnetId, label: 'Valve d’eau', ...body } }))).id
const upload = async (s: Session, path: string, type = 'image/jpeg') => (await okJson<{ key: string }>(s.fetch(path, { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': type } }))).key
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('un carnet', () => {
  it('is created, nested, edited, and its photo is freed when replaced', async () => {
    const s = await household('carnets-crud', undefined, { empty: true })
    const key = await upload(s, '/api/carnets')
    const home = await add(s, { name: '  Chalet  ', color: '#123456', facts: { built_year: 1978 }, notes: ' au lac ', mediaKey: key })
    const heater = await add(s, { name: 'Chauffe-eau', kind: 'appliance', parentId: home, installedAt: 1600000000, lifespanMonths: 144 })

    expect(await one(s, home)).toMatchObject({ name: 'Chalet', kind: 'home', color: '#123456', facts: { built_year: 1978 }, notes: 'au lac', parentId: null, mediaKey: key })
    expect(await one(s, heater)).toMatchObject({ parentId: home, kind: 'appliance', installedAt: 1600000000, lifespanMonths: 144 })

    await okJson(patch(s, { id: heater, lifespanMonths: 999999, facts: {}, kind: 'pas-un-genre' }))
    expect(await one(s, heater), 'a cap of a century, an empty facts is none, a bad kind is a thing').toMatchObject({ lifespanMonths: 1200, facts: null, kind: 'thing' })

    const next = await upload(s, '/api/carnets')
    await okJson(patch(s, { id: home, mediaKey: next }))
    expect(await stored(key)).toBe(false)
    expect((await one(s, home))!.mediaKey).toBe(next)
    expect((await patch(s, { id: home, name: '  ' })).status).toBe(400)
  })

  it('a child points at a carnet we own; a stranger’s tree is out of reach', async () => {
    const s = await household('carnets-a', undefined, { empty: true })
    const other = await household('carnets-b', undefined, { empty: true })
    const theirs = await add(other, {})
    expect((await s.fetch('/api/carnets', { method: 'POST', body: { name: 'Toit', parentId: theirs } })).status).toBe(400)
    expect((await s.fetch('/api/carnets', { method: 'POST', body: { name: ' ' } })).status).toBe(400)
    expect((await patch(s, { id: theirs, name: 'Volé' })).status).toBe(404)
    expect((await archive(s, theirs)).status).toBe(404)
    expect((await patch(s, { id: theirs, restore: true })).status).toBe(404)
    expect((await one(other, theirs))?.name).toBe('Maison')
  })

  it('the archive takes the whole subtree, shows it once at its top, and restores it', async () => {
    const s = await household('carnets-archive', undefined, { empty: true })
    const home = await add(s, { name: 'Maison' })
    const room = await add(s, { name: 'Sous-sol', kind: 'zone', parentId: home })
    const heater = await add(s, { name: 'Chauffe-eau', parentId: room })
    const car = await add(s, { name: 'Auto', kind: 'auto' })

    await okJson(archive(s, home))
    expect((await read(s)).carnets.map((c) => c.id), 'nothing orphaned below it').toEqual([car])
    expect((await read(s, '?archived=1')).carnets.map((c) => c.id), 'one entry per subtree').toEqual([home])

    await okJson(patch(s, { id: home, restore: true }))
    expect((await read(s)).carnets.map((c) => c.id).sort()).toEqual([home, room, heater, car].sort())
    expect((await read(s, '?archived=1')).carnets).toEqual([])
  })

  it('a child archived on its own shows at its own top, and its blob stays for a possible return', async () => {
    const s = await household('carnets-child', undefined, { empty: true })
    const key = await upload(s, '/api/carnets')
    const home = await add(s, {})
    const heater = await add(s, { name: 'Chauffe-eau', parentId: home, mediaKey: key })
    await okJson(archive(s, heater))
    expect((await read(s, '?archived=1')).carnets.map((c) => c.id)).toEqual([heater])
    expect(await stored(key), 'an archive is reversible').toBe(true)
  })

  it('« le long jeu » flags a thing reaching the end of its life, and only that', async () => {
    const s = await household('carnets-life', undefined, { empty: true })
    const now = Math.floor(Date.now() / 1000)
    await add(s, { name: 'Vieille fournaise', kind: 'appliance', installedAt: now - 14 * 365 * 86400, lifespanMonths: 168 })
    await add(s, { name: 'Neuf', kind: 'appliance', installedAt: now - 86400, lifespanMonths: 240 })
    const { soon } = await read(s)
    expect(JSON.stringify(soon)).toContain('Vieille fournaise')
    expect(JSON.stringify(soon)).not.toContain('Neuf')
  })
})

describe('le carnet d’entretien', () => {
  it('an entry is logged, read newest first, edited, and deleted', async () => {
    const s = await household('care-crud', undefined, { empty: true })
    const a = await add(s, { name: 'A' })
    const b = await add(s, { name: 'B' })
    const today = localDayStart(new Date())
    const old = await log(s, a, { title: '  Installation  ', at: addLocalDays(today, -10), kind: 'install', costCents: 125099.9, note: ' facture ' })
    const recent = await log(s, a, { title: 'Vidange', at: today, kind: 'pas-un-genre', costCents: -5 })
    await log(s, b, { title: 'Ailleurs' })

    expect((await entries(s, `?carnet=${a}`)).map((e) => e.id), 'newest first, this carnet only').toEqual([recent, old])
    expect((await entries(s)).length, 'the global read for search').toBe(3)
    expect((await entries(s, `?carnet=${a}`))[1]).toMatchObject({ title: 'Installation', kind: 'install', costCents: 125099, note: 'facture' })
    expect((await entries(s, `?carnet=${a}`))[0], 'an unknown kind is a note, a negative cost is none').toMatchObject({ kind: 'note', costCents: null })

    await okJson(s.fetch('/api/care-log', { method: 'PATCH', body: { id: old, costCents: null, note: 'payée' } }))
    expect((await entries(s, `?carnet=${a}`))[1]).toMatchObject({ costCents: null, note: 'payée', title: 'Installation' })

    await okJson(s.fetch('/api/care-log', { method: 'DELETE', body: { id: old } }))
    expect((await entries(s, `?carnet=${a}`)).map((e) => e.id)).toEqual([recent])
  })

  it('refuses a stranger’s carnet, a missing title, and an edit that is not ours', async () => {
    const s = await household('care-a', undefined, { empty: true })
    const other = await household('care-b', undefined, { empty: true })
    const mine = await add(s, {})
    expect((await other.fetch('/api/care-log', { method: 'POST', body: { carnetId: mine, title: 'x' } })).status).toBe(400)
    expect((await s.fetch('/api/care-log', { method: 'POST', body: { carnetId: mine, title: ' ' } })).status).toBe(400)
    const id = await log(s, mine)
    expect((await other.fetch('/api/care-log', { method: 'PATCH', body: { id, title: 'Volé' } })).status).toBe(404)
    expect(await entries(other, `?carnet=${mine}`)).toEqual([])
  })

  it('a document keeps its type in its key, a dropped one is freed, the delete frees the rest', async () => {
    const s = await household('care-docs', undefined, { empty: true })
    const c = await add(s, {})
    const pdf = await upload(s, '/api/care-log', 'application/pdf')
    expect(pdf, 'the viewer tells a PDF from the key alone').toMatch(/^cl_.*\.pdf$/)
    const jpg = await upload(s, '/api/care-log', 'image/jpeg')
    const id = await log(s, c, { mediaKeys: [pdf, jpg, 7, '  '] })
    expect((await entries(s, `?carnet=${c}`))[0]?.mediaKeys).toEqual([pdf, jpg])

    await okJson(s.fetch('/api/care-log', { method: 'PATCH', body: { id, mediaKeys: [jpg] } }))
    expect(await stored(pdf)).toBe(false)
    expect(await stored(jpg)).toBe(true)

    await okJson(s.fetch('/api/care-log', { method: 'DELETE', body: { id } }))
    expect(await stored(jpg)).toBe(false)
  })
})

describe('en cas de pépin', () => {
  it('a pin is added, read in order, edited, and deleted with its photo', async () => {
    const s = await household('pins-crud', undefined, { empty: true })
    const c = await add(s, {})
    const key = await upload(s, '/api/home-pins')
    expect(key).toMatch(/^hp_/)
    const first = await pin(s, c, { label: '  Valve d’eau  ', detail: ' sous l’escalier ', mediaKey: key })
    const second = await pin(s, c, { label: 'Thermostat', kind: 'howto' })
    await pin(s, await add(s, { name: 'Auto' }), { label: 'Ailleurs', kind: 'pas-un-genre' })

    await okJson(s.fetch('/api/home-pins', { method: 'PATCH', body: { id: first, sort: 2 } }))
    await okJson(s.fetch('/api/home-pins', { method: 'PATCH', body: { id: second, sort: 1 } }))
    expect((await pins(s, `?carnet=${c}`)).map((p) => p.label), 'the order is the one set').toEqual(['Thermostat', 'Valve d’eau'])
    expect((await pins(s)).find((p) => p.label === 'Ailleurs')!.kind, 'an unknown kind is a « where »').toBe('where')
    expect((await pins(s, `?carnet=${c}`))[1]).toMatchObject({ detail: 'sous l’escalier', kind: 'where', mediaKey: key })

    const next = await upload(s, '/api/home-pins')
    await okJson(s.fetch('/api/home-pins', { method: 'PATCH', body: { id: first, mediaKey: next } }))
    expect(await stored(key)).toBe(false)

    await okJson(s.fetch('/api/home-pins', { method: 'DELETE', body: { id: first } }))
    expect((await pins(s, `?carnet=${c}`)).map((p) => p.id)).toEqual([second])
    expect(await stored(next)).toBe(false)
  })

  it('refuses a stranger’s carnet; a stranger cannot edit or free a pin', async () => {
    const s = await household('pins-a', undefined, { empty: true })
    const other = await household('pins-b', undefined, { empty: true })
    const c = await add(s, {})
    const key = await upload(s, '/api/home-pins')
    const id = await pin(s, c, { mediaKey: key })
    expect((await other.fetch('/api/home-pins', { method: 'POST', body: { carnetId: c, label: 'x' } })).status).toBe(400)
    expect((await other.fetch('/api/home-pins', { method: 'PATCH', body: { id, label: 'Volé' } })).status).toBe(404)
    await okJson(other.fetch('/api/home-pins', { method: 'DELETE', body: { id } }))
    expect(await stored(key)).toBe(true)
    expect(await pins(s)).toHaveLength(1)
  })
})
