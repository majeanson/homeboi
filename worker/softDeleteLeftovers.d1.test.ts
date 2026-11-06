import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// WHAT A SOFT DELETE LEAVES BEHIND (2026-11-06). Neither delete has an undo, so nothing may
// keep pointing at the gone row. A pet left its links and group memberships, which
// /api/cercle went on serving as edges to nobody. A trip hid its notes but never freed their
// files, against the comment on its own handler, so a deleted passport scan sat in R2.

const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null
const circle = (s: Session) =>
  okJson<{ links: { personAId: string; personBId: string }[]; groups: { memberKeys: { personId: string }[] }[] }>(
    s.fetch('/api/cercle'),
  )
const pet = async (s: Session) => (await okJson<{ id: string }>(s.fetch('/api/pets', { method: 'POST', body: { name: 'Rex' } }))).id
const member = async (s: Session) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))).id
const uploadDoc = (s: Session) =>
  okJson<{ key: string; kind: string }>(
    s.fetch('/api/trip-doc-media', { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': 'image/jpeg' } }),
  )

describe('deleting a pet', () => {
  it('takes its links and its group memberships along', async () => {
    const s = await household('pet-edges', undefined, { empty: true })
    const rex = await pet(s)
    const lea = await member(s)
    await okJson(s.fetch('/api/cercle-links', { method: 'POST', body: { aId: lea, aKind: 'member', bId: rex, bKind: 'pet', type: 'owner' } }))
    const group = await okJson<{ id: string }>(s.fetch('/api/cercle-groups', { method: 'POST', body: { name: 'Le parc', kind: 'friends' } }))
    await okJson(s.fetch('/api/cercle-groups', { method: 'POST', body: { groupId: group.id, personId: rex, personKind: 'pet' } }))
    const before = await circle(s)
    expect(before.links.some((l) => l.personBId === rex || l.personAId === rex), 'the fixture linked the pet').toBe(true)

    await okJson(s.fetch('/api/pets', { method: 'DELETE', body: { id: rex } }))

    const after = await circle(s)
    expect(after.links.filter((l) => l.personAId === rex || l.personBId === rex)).toEqual([])
    expect(after.groups.flatMap((g) => g.memberKeys).filter((k) => k.personId === rex)).toEqual([])
  })

  it('from another household changes nothing', async () => {
    const a = await household('pet-a', undefined, { empty: true })
    const b = await household('pet-b', undefined, { empty: true })
    const rex = await pet(a)
    const lea = await member(a)
    await okJson(a.fetch('/api/cercle-links', { method: 'POST', body: { aId: lea, aKind: 'member', bId: rex, bKind: 'pet', type: 'owner' } }))
    await b.fetch('/api/pets', { method: 'DELETE', body: { id: rex } })
    expect((await circle(a)).links.length).toBe(1)
  })
})

describe('deleting a trip', () => {
  const trip = async (s: Session) => (await okJson<{ id: string }>(s.fetch('/api/trips', { method: 'POST', body: { title: 'Gaspésie' } }))).id
  const attach = async (s: Session, tripId: string) => {
    const doc = await uploadDoc(s)
    await okJson(s.fetch('/api/trip-notes', { method: 'POST', body: { tripId, category: 'document', media_kind: doc.kind, media_key: doc.key } }))
    return doc.key
  }

  it('frees the files of its notes, as its comment says', async () => {
    const s = await household('trip-blobs', undefined, { empty: true })
    const id = await trip(s)
    const key = await attach(s, id)
    expect(await stored(key)).toBe(true)
    await okJson(s.fetch('/api/trips', { method: 'DELETE', body: { id } }))
    expect(await stored(key)).toBe(false)
  })

  it('from another household frees nothing', async () => {
    const a = await household('trip-a', undefined, { empty: true })
    const b = await household('trip-b', undefined, { empty: true })
    const id = await trip(a)
    const key = await attach(a, id)
    await b.fetch('/api/trips', { method: 'DELETE', body: { id } })
    expect(await stored(key)).toBe(true)
  })
})
