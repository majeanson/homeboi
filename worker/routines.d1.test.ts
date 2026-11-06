import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'
import { STICKERS } from '../src/lib/stickers'

// LES ROUTINES against a real D1 and R2: a deck per child, a day that empties at local
// midnight, a timer that keeps real time across an app close, and the blobs a card owns.

interface Card {
  label: string
  icon?: string
  seconds?: number
  tip?: string
  clipKey?: string
  photoKey?: string
}
interface Routine {
  id: string
  memberId: string
  memberName: string | null
  name: string
  timeOfDay: string | null
  cards: Card[]
  doneIdx: number[]
  timers: Record<string, { endsAt?: number; left?: number }>
}

const all = async (s: Session) => (await okJson<{ routines: Routine[]; date: number }>(s.fetch('/api/routines'))).routines
const one = async (s: Session, id: string) => (await all(s)).find((r) => r.id === id)!
const kid = async (s: Session, name = 'Zoé') => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name, isChild: true } }))).id
const make = async (s: Session, memberId: string, body: Record<string, unknown> = {}) =>
  (await okJson<{ ids: string[] }>(s.fetch('/api/routines', { method: 'POST', body: { memberId, name: 'Dodo', cards: [{ label: 'Dents' }, { label: 'Pyjama' }], ...body } }))).ids[0]
const patch = (s: Session, body: Record<string, unknown>) => okJson<{ doneIdx?: number[] }>(s.fetch('/api/routines', { method: 'PATCH', body }))
const upload = (s: Session, path: string, type: string) => okJson<{ key: string }>(s.fetch(path, { method: 'POST', raw: new Uint8Array([1, 2, 3]), headers: { 'content-type': type } }))
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('une routine', () => {
  it('is built, read with its owner, edited, and deleted with its runs', async () => {
    const s = await household('routines-crud', undefined, { empty: true })
    const zoe = await kid(s)
    const id = await make(s, zoe, { timeOfDay: 'evening' })
    expect(await one(s, id)).toMatchObject({ memberId: zoe, memberName: 'Zoé', name: 'Dodo', timeOfDay: 'evening', doneIdx: [], timers: {} })

    await patch(s, { routineId: id, name: ' Grand dodo ', timeOfDay: 'pas-une-heure', cards: [{ label: 'Histoire' }] })
    expect(await one(s, id), 'an unknown cue reads as « anytime »').toMatchObject({ name: 'Grand dodo', timeOfDay: null, cards: [{ label: 'Histoire' }] })

    // A run exists, so the FK has something to refuse if the delete forgets it.
    await patch(s, { routineId: id, cardIdx: 0 })
    await okJson(s.fetch('/api/routines', { method: 'DELETE', body: { id } }))
    expect(await all(s)).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM routine_runs WHERE routine_id = ?').bind(id).first()).toBeNull()
  })

  it('refuses a routine with no child or no name; a stranger’s routine is a 404', async () => {
    const s = await household('routines-a', undefined, { empty: true })
    const other = await household('routines-b', undefined, { empty: true })
    expect((await s.fetch('/api/routines', { method: 'POST', body: { name: 'Dodo' } })).status).toBe(400)
    const zoe = await kid(s)
    expect((await s.fetch('/api/routines', { method: 'POST', body: { memberId: zoe, name: '  ' } })).status).toBe(400)
    const id = await make(s, zoe)
    expect((await other.fetch('/api/routines', { method: 'PATCH', body: { routineId: id, cardIdx: 0 } })).status).toBe(404)
    expect((await one(s, id)).doneIdx).toEqual([])
  })

  it('assigned to two kids, it is two routines: Maya ticking her teeth does not tick Léo’s', async () => {
    const s = await household('routines-two', undefined, { empty: true })
    const maya = await kid(s, 'Maya')
    const leo = await kid(s, 'Léo')
    const { ids } = await okJson<{ ids: string[] }>(s.fetch('/api/routines', { method: 'POST', body: { memberIds: [maya, leo], name: 'Dodo', cards: [{ label: 'Dents' }] } }))
    expect(ids).toHaveLength(2)
    await patch(s, { routineId: ids[0], cardIdx: 0 })
    expect((await one(s, ids[0])).doneIdx).toEqual([0])
    expect((await one(s, ids[1])).doneIdx).toEqual([])
  })

  it('a deck is cleaned on the way in: the timer in range, the tip short, a bad media key dropped', async () => {
    const s = await household('routines-cards', undefined, { empty: true })
    const id = await make(s, await kid(s), {
      cards: [
        { label: 'Long', seconds: 99999.4, tip: `  ${'t'.repeat(300)}  `, clipKey: 'pas une clé !', photoKey: 'rcp_ok-1' },
        { label: 'Zéro', seconds: 0, tip: '   ' },
        { label: 'Texte', seconds: 'beaucoup' },
      ],
    })
    const [long, zero, text] = (await one(s, id)).cards
    expect(long.seconds).toBe(3600)
    expect(long.tip).toHaveLength(200)
    expect(long.clipKey).toBeUndefined()
    expect(long.photoKey).toBe('rcp_ok-1')
    expect(zero).toEqual({ label: 'Zéro' })
    expect(text).toEqual({ label: 'Texte' })
  })
})

describe('la journée d’une routine', () => {
  it('a tap ticks and unticks a card, and « Recommencer » wipes the day', async () => {
    const s = await household('routines-day', undefined, { empty: true })
    const id = await make(s, await kid(s))
    expect((await patch(s, { routineId: id, cardIdx: 1 })).doneIdx).toEqual([1])
    await patch(s, { routineId: id, cardIdx: 0 })
    await patch(s, { routineId: id, cardIdx: 0 })
    expect((await one(s, id)).doneIdx.slice().sort(), 'a replayed tap is one tick').toEqual([0, 1])

    await patch(s, { routineId: id, cardIdx: 1, done: false })
    expect((await one(s, id)).doneIdx).toEqual([0])

    expect((await patch(s, { routineId: id, reset: true })).doneIdx).toEqual([])
    expect((await one(s, id)).doneIdx, 'it stays reset on the next poll').toEqual([])
  })

  it('the day empties at local midnight: yesterday’s ticks are not today’s', async () => {
    const s = await household('routines-midnight', undefined, { empty: true })
    const id = await make(s, await kid(s))
    await patch(s, { routineId: id, cardIdx: 0 })
    const today = localDayStart(new Date())
    await env.DB.prepare('UPDATE routine_runs SET date = ? WHERE routine_id = ?').bind(addLocalDays(today, -1), id).run()
    expect((await one(s, id)).doneIdx).toEqual([])
    await patch(s, { routineId: id, cardIdx: 1 })
    expect((await one(s, id)).doneIdx, 'a new day starts its own run').toEqual([1])
  })

  it('a timer survives the app closing, sits beside the ticks, and clears', async () => {
    const s = await household('routines-timer', undefined, { empty: true })
    const id = await make(s, await kid(s))
    await patch(s, { routineId: id, cardIdx: 0, timer: { endsAt: 2000000000 } })
    await patch(s, { routineId: id, cardIdx: 1 })
    await patch(s, { routineId: id, cardIdx: 1, timer: { left: 90 } })
    expect(await one(s, id), 'neither write stepped on the other').toMatchObject({ doneIdx: [1], timers: { 0: { endsAt: 2000000000 }, 1: { left: 90 } } })

    await patch(s, { routineId: id, cardIdx: 0, timer: null })
    expect((await one(s, id)).timers).toEqual({ 1: { left: 90 } })
  })
})

describe('les médias d’une carte', () => {
  it('a clip and a photo ride the card, a dropped card frees its blob, the delete frees the rest', async () => {
    const s = await household('routines-media', undefined, { empty: true })
    const clip = await upload(s, '/api/routine-audio', 'audio/webm')
    const photo = await upload(s, '/api/routine-card-photo', 'image/jpeg')
    const gone = await upload(s, '/api/routine-card-photo', 'image/jpeg')
    expect(clip.key).toMatch(/^rn_/)
    expect(photo.key).toMatch(/^rcp_/)

    const id = await make(s, await kid(s), { cards: [{ label: 'Dents', clipKey: clip.key, photoKey: photo.key }, { label: 'Lit', photoKey: gone.key }] })
    await patch(s, { routineId: id, cards: [{ label: 'Dents', clipKey: clip.key, photoKey: photo.key }] })
    expect(await stored(gone.key), 'a removed card leaks nothing').toBe(false)
    expect(await stored(photo.key)).toBe(true)

    await okJson(s.fetch('/api/routines', { method: 'DELETE', body: { id } }))
    expect(await stored(clip.key)).toBe(false)
    expect(await stored(photo.key)).toBe(false)
  })

  it('a voice door takes sound, not a picture', async () => {
    const s = await household('routines-type', undefined, { empty: true })
    expect((await s.fetch('/api/routine-audio', { method: 'POST', raw: new Uint8Array([1]), headers: { 'content-type': 'image/png' } })).status).toBe(400)
    expect((await s.fetch('/api/routine-card-photo', { method: 'POST', raw: new Uint8Array([1]), headers: { 'content-type': 'audio/webm' } })).status).toBe(400)
  })
})

describe('le mur d’autocollants', () => {
  const wall = async (s: Session) => (await okJson<{ stickers: { id: string; memberId: string | null; sticker: string; routineId: string | null }[] }>(s.fetch('/api/routine-stickers'))).stickers

  it('takes a sticker from the closed set, keeps it past the routine, and lets a parent curate', async () => {
    const s = await household('routines-stickers', undefined, { empty: true })
    const other = await household('routines-stickers-b', undefined, { empty: true })
    const zoe = await kid(s)
    const routine = await make(s, zoe)
    const sticker = STICKERS[0]

    expect((await s.fetch('/api/routine-stickers', { method: 'POST', body: { sticker: '<script>', memberId: zoe } })).status, 'the column holds no free text').toBe(400)
    const { id } = await okJson<{ id: string }>(s.fetch('/api/routine-stickers', { method: 'POST', body: { sticker, memberId: zoe, routineId: routine } }))
    expect(await wall(s)).toEqual([expect.objectContaining({ id, memberId: zoe, sticker, routineId: routine })])

    await okJson(s.fetch('/api/routines', { method: 'DELETE', body: { id: routine } }))
    expect(await wall(s), 'the wall is permanent').toHaveLength(1)

    expect((await other.fetch('/api/routine-stickers', { method: 'DELETE', body: { id } })).status).toBe(404)
    await okJson(s.fetch('/api/routine-stickers', { method: 'DELETE', body: { id } }))
    expect(await wall(s)).toEqual([])
  })
})
