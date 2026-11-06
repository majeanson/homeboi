import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// « LE CERCLE » against a real D1 and R2: the people directory, the typed edges between
// them, the named groups whose colour follows a family everywhere, and each person's
// gallery. A contact's delete is the delicate one: its edges FK-reference it.

interface Contact {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  photoKey: string | null
  birthday: string | null
  email: string | null
  address: Record<string, string> | null
  notes: string | null
  tags: string[]
  memberId: string | null
  customFields: unknown[]
  gender: string | null
  giftIdeas: string | null
}
interface Link {
  id: string
  personAId: string
  personAKind: string
  personBId: string
  personBKind: string
  type: string
  reverseType: string
  label: string | null
  notes: string | null
}
interface Group {
  id: string
  name: string
  kind: string
  colour: string | null
  memberKeys: { personId: string; personKind: string }[]
}
interface Circle {
  members: { id: string; displayName: string; colour: string }[]
  contacts: Contact[]
  links: Link[]
  groups: Group[]
  pets: { id: string; name: string; colour: string | null }[]
}

const circle = (s: Session) => okJson<Circle>(s.fetch('/api/cercle'))
const contact = async (s: Session, id: string) => (await circle(s)).contacts.find((c) => c.id === id)
const add = async (s: Session, firstName: string, more: Record<string, unknown> = {}) => (await okJson<{ id: string }>(s.fetch('/api/cercle', { method: 'POST', body: { firstName, ...more } }))).id
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const pet = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/pets', { method: 'POST', body: { name } }))).id
const link = (s: Session, body: Record<string, unknown>) => s.fetch('/api/cercle-links', { method: 'POST', body })
const group = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/cercle-groups', { method: 'POST', body }))).id
const join = (s: Session, groupId: string, personId: string, personKind: string) => okJson(s.fetch('/api/cercle-groups', { method: 'POST', body: { groupId, personId, personKind } }))
const photo = async (s: Session) => (await okJson<{ key: string }>(s.fetch('/api/cercle', { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': 'image/jpeg' } }))).key
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('une personne', () => {
  it('is added, read back whole, edited field by field, and removed', async () => {
    const s = await household('cercle-crud', undefined, { empty: true })
    const id = await add(s, '  Tante  ', {
      lastName: ' Gagnon ',
      email: ' tante@exemple.test ',
      birthday: '1961-03-04',
      address: { city: 'Rimouski' },
      tags: ['Famille'],
      customFields: [{ label: 'Allergie', value: 'noix' }],
      gender: 'f',
      giftIdeas: ' Tricot ',
    })
    expect(await contact(s, id)).toMatchObject({ firstName: 'Tante', lastName: 'Gagnon', email: 'tante@exemple.test', birthday: '1961-03-04', address: { city: 'Rimouski' }, tags: ['Famille'], gender: 'f', giftIdeas: 'Tricot' })

    await okJson(s.fetch('/api/cercle', { method: 'PATCH', body: { id, nickname: 'Titi', email: null, gender: 'x' } }))
    expect(await contact(s, id), 'only the keys sent change, null clears').toMatchObject({ firstName: 'Tante', nickname: 'Titi', email: null, gender: null, birthday: '1961-03-04' })
    expect((await s.fetch('/api/cercle', { method: 'PATCH', body: { id, firstName: '  ' } })).status).toBe(400)

    await okJson(s.fetch('/api/cercle', { method: 'DELETE', body: { id } }))
    expect((await circle(s)).contacts).toEqual([])
  })

  it('a bad value cannot poison a column, and a nonsense birthday reads as none', async () => {
    const s = await household('cercle-junk', undefined, { empty: true })
    const id = await add(s, 'Paul', { address: 'pas un objet', tags: 'pas une liste', customFields: { x: 1 }, birthday: 'demain' })
    expect(await contact(s, id)).toMatchObject({ address: null, tags: [], customFields: [], birthday: null })
    expect((await s.fetch('/api/cercle', { method: 'POST', body: { firstName: ' ' } })).status).toBe(400)
  })

  it('a stranger’s contact is a 404 both ways', async () => {
    const s = await household('cercle-a', undefined, { empty: true })
    const other = await household('cercle-b', undefined, { empty: true })
    const id = await add(s, 'Paul')
    expect((await other.fetch('/api/cercle', { method: 'PATCH', body: { id, notes: 'x' } })).status).toBe(404)
    expect((await other.fetch('/api/cercle', { method: 'DELETE', body: { id } })).status).toBe(404)
    expect(await contact(s, id)).toBeTruthy()
    expect((await circle(other)).contacts).toEqual([])
  })

  it('a replaced photo is freed; the delete frees the portrait and the whole gallery', async () => {
    const s = await household('cercle-photo', undefined, { empty: true })
    const first = await photo(s)
    const id = await add(s, 'Paul', { photoKey: first })
    const next = await photo(s)
    await okJson(s.fetch('/api/cercle', { method: 'PATCH', body: { id, photoKey: next } }))
    expect(await stored(first)).toBe(false)

    const galleryKey = await photo(s)
    const pic = await okJson<{ id: string }>(s.fetch('/api/cercle-photos', { method: 'POST', body: { contactId: id, photoKey: galleryKey, caption: '  Carte  ' } }))
    await okJson(s.fetch('/api/cercle', { method: 'DELETE', body: { id } }))
    expect(await stored(next)).toBe(false)
    expect(await stored(galleryKey)).toBe(false)
    expect(await env.DB.prepare('SELECT 1 FROM contact_photos WHERE id = ?').bind(pic.id).first(), 'the row cascades with the contact').toBeNull()
  })
})

describe('la galerie d’une personne', () => {
  const gallery = async (s: Session, contactId: string) => (await okJson<{ photos: { id: string; photoKey: string; caption: string | null }[] }>(s.fetch(`/api/cercle-photos?contactId=${contactId}`))).photos

  it('attaches, captions, and detaches a picture, freeing its blob', async () => {
    const s = await household('cercle-gallery', undefined, { empty: true })
    const id = await add(s, 'Paul')
    const key = await photo(s)
    const pic = await okJson<{ id: string }>(s.fetch('/api/cercle-photos', { method: 'POST', body: { contactId: id, photoKey: key, caption: '  Carte  ' } }))
    expect(await gallery(s, id)).toEqual([expect.objectContaining({ id: pic.id, photoKey: key, caption: 'Carte' })])

    await okJson(s.fetch('/api/cercle-photos', { method: 'PATCH', body: { id: pic.id, caption: 'Carte d’assurance' } }))
    expect((await gallery(s, id))[0].caption).toBe('Carte d’assurance')

    await okJson(s.fetch('/api/cercle-photos', { method: 'DELETE', body: { id: pic.id } }))
    expect(await gallery(s, id)).toEqual([])
    expect(await stored(key)).toBe(false)
  })

  it('cannot hang off a stranger’s contact', async () => {
    const s = await household('cercle-gallery-a', undefined, { empty: true })
    const other = await household('cercle-gallery-b', undefined, { empty: true })
    const id = await add(s, 'Paul')
    expect((await other.fetch('/api/cercle-photos', { method: 'POST', body: { contactId: id, photoKey: 'cn_x' } })).status).toBe(404)
    expect(await gallery(other, id)).toEqual([])
  })
})

describe('les liens', () => {
  it('stores one edge with its inverse, derived on the server, across any two kinds of person', async () => {
    const s = await household('links-kinds', undefined, { empty: true })
    const kid = await member(s, 'Zoé')
    const mamie = await add(s, 'Mamie')
    const rex = await pet(s, 'Rex')

    const { id } = await okJson<{ id: string }>(link(s, { aId: mamie, aKind: 'contact', bId: kid, bKind: 'member', type: 'parent', label: ' Grand-maman ' }))
    await okJson(link(s, { aId: kid, aKind: 'member', bId: rex, bKind: 'pet', type: 'friend' }))
    const { links } = await circle(s)
    expect(links.find((l) => l.id === id)).toMatchObject({ personAId: mamie, personAKind: 'contact', personBId: kid, personBKind: 'member', type: 'parent', reverseType: 'child', label: 'Grand-maman' })
    expect(links.find((l) => l.personBKind === 'pet')!.personBId).toBe(rex)
  })

  it('refuses a self-link, an unknown type, a stranger, and the same relationship read backwards', async () => {
    const s = await household('links-refuse', undefined, { empty: true })
    const other = await household('links-refuse-b', undefined, { empty: true })
    const a = await add(s, 'A')
    const b = await add(s, 'B')
    const theirs = await add(other, 'Z')
    expect((await link(s, { aId: a, bId: a, type: 'friend' })).status).toBe(400)
    expect((await link(s, { aId: a, bId: b, type: 'pas-un-lien' })).status).toBe(400)
    expect((await link(s, { aId: a, bId: theirs, type: 'friend' })).status, 'every endpoint is a person of THIS household').toBe(404)

    await okJson(link(s, { aId: a, bId: b, type: 'parent' }))
    expect((await link(s, { aId: a, bId: b, type: 'parent' })).status).toBe(409)
    expect((await link(s, { aId: b, bId: a, type: 'child' })).status, 'a→b parent IS b→a child').toBe(409)
    expect((await circle(s)).links).toHaveLength(1)
  })

  it('an edit keeps the inverse in step; a delete removes the edge and leaves the people', async () => {
    const s = await household('links-edit', undefined, { empty: true })
    const a = await add(s, 'A')
    const b = await add(s, 'B')
    const { id } = await okJson<{ id: string }>(link(s, { aId: a, bId: b, type: 'parent', notes: 'note' }))

    await okJson(s.fetch('/api/cercle-links', { method: 'PATCH', body: { id, type: 'friend', label: 'Voisin', notes: null } }))
    expect((await circle(s)).links[0]).toMatchObject({ type: 'friend', reverseType: 'friend', label: 'Voisin', notes: null })
    expect((await s.fetch('/api/cercle-links', { method: 'PATCH', body: { id, type: 'nope' } })).status).toBe(400)

    await okJson(s.fetch('/api/cercle-links', { method: 'DELETE', body: { id } }))
    const after = await circle(s)
    expect(after.links).toEqual([])
    expect(after.contacts).toHaveLength(2)
  })

  it('deleting a contact takes its edges, in both directions, and leaves everyone else’s', async () => {
    const s = await household('links-cascade', undefined, { empty: true })
    const a = await add(s, 'A')
    const b = await add(s, 'B')
    const c = await add(s, 'C')
    await okJson(link(s, { aId: a, bId: b, type: 'friend' }))
    await okJson(link(s, { aId: c, bId: a, type: 'friend' }))
    await okJson(link(s, { aId: b, bId: c, type: 'friend' }))
    await okJson(s.fetch('/api/cercle', { method: 'DELETE', body: { id: a } }))
    const { links } = await circle(s)
    expect(links.map((l) => [l.personAId, l.personBId])).toEqual([[b, c]])
  })
})

describe('les groupes', () => {
  it('a group is made, renamed, joined, left, and deleted without touching its people', async () => {
    const s = await household('groups-crud', undefined, { empty: true })
    const a = await add(s, 'A')
    const id = await group(s, { name: '  Famille Tremblay  ', kind: 'family' })
    expect((await circle(s)).groups[0]).toMatchObject({ id, name: 'Famille Tremblay', kind: 'family', colour: null, memberKeys: [] })

    await join(s, id, a, 'contact')
    await join(s, id, a, 'contact')
    expect((await circle(s)).groups[0].memberKeys, 'joining twice is one membership').toEqual([{ personId: a, personKind: 'contact' }])

    await okJson(s.fetch('/api/cercle-groups', { method: 'PATCH', body: { id, name: 'Les Tremblay', kind: 'pas-un-genre' } }))
    expect((await circle(s)).groups[0]).toMatchObject({ name: 'Les Tremblay', kind: 'family' })

    await okJson(s.fetch('/api/cercle-groups', { method: 'DELETE', body: { groupId: id, personId: a, personKind: 'contact' } }))
    expect((await circle(s)).groups[0].memberKeys).toEqual([])

    await join(s, id, a, 'contact')
    await okJson(s.fetch('/api/cercle-groups', { method: 'DELETE', body: { id } }))
    const after = await circle(s)
    expect(after.groups).toEqual([])
    expect(after.contacts, 'the people stay').toHaveLength(1)
    expect(await env.DB.prepare('SELECT 1 FROM contact_group_members WHERE group_id = ?').bind(id).first(), 'memberships cascade').toBeNull()
  })

  it('a family’s colour follows its people and its pets, joining or recolouring, and clearing keeps it', async () => {
    const s = await household('groups-colour', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const rex = await pet(s, 'Rex')
    const outsider = await member(s, 'Marc')
    const id = await group(s, { name: 'Famille', colour: '#112233' })
    const colours = async () => {
      const c = await circle(s)
      return { lea: c.members.find((m) => m.id === lea)!.colour, rex: c.pets.find((p) => p.id === rex)!.colour, outsider: c.members.find((m) => m.id === outsider)!.colour }
    }
    const before = await colours()

    await join(s, id, lea, 'member')
    await join(s, id, rex, 'pet')
    expect(await colours()).toMatchObject({ lea: '#112233', rex: '#112233', outsider: before.outsider })

    await okJson(s.fetch('/api/cercle-groups', { method: 'PATCH', body: { id, colour: '#445566' } }))
    expect(await colours()).toMatchObject({ lea: '#445566', rex: '#445566' })

    await okJson(s.fetch('/api/cercle-groups', { method: 'PATCH', body: { id, colour: null } }))
    expect((await circle(s)).groups[0].colour).toBeNull()
    expect((await colours()).lea, 'their prior colour is unknowable').toBe('#445566')
  })

  it('takes a known kind of person only, and a stranger’s group is a 404', async () => {
    const s = await household('groups-refuse', undefined, { empty: true })
    const other = await household('groups-refuse-b', undefined, { empty: true })
    const id = await group(s, { name: 'Amis' })
    expect((await s.fetch('/api/cercle-groups', { method: 'POST', body: { groupId: id, personId: 'x', personKind: 'robot' } })).status).toBe(400)
    expect((await s.fetch('/api/cercle-groups', { method: 'POST', body: { name: '  ' } })).status).toBe(400)
    expect((await other.fetch('/api/cercle-groups', { method: 'POST', body: { groupId: id, personId: 'x', personKind: 'contact' } })).status).toBe(404)
    expect((await other.fetch('/api/cercle-groups', { method: 'PATCH', body: { id, name: 'Volé' } })).status).toBe(404)
    expect((await other.fetch('/api/cercle-groups', { method: 'DELETE', body: { id } })).status).toBe(404)
    expect((await circle(s)).groups).toHaveLength(1)
  })

  it('a deleted contact leaves its groups', async () => {
    const s = await household('groups-leave', undefined, { empty: true })
    const a = await add(s, 'A')
    const id = await group(s, { name: 'Amis' })
    await join(s, id, a, 'contact')
    await okJson(s.fetch('/api/cercle', { method: 'DELETE', body: { id: a } }))
    expect((await circle(s)).groups[0].memberKeys).toEqual([])
  })
})
