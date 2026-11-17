import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'

// LE CADRE, LES VISAGES, LES PIÈCES JOINTES against a real D1 and R2: three remaining doors
// that store a blob. What they share is that the bucket has to stay honest: a capped frame
// prunes, a replaced face is freed, an abandoned upload can go, and only its own.

const upload = (s: Session, path: string, type = 'image/jpeg', raw: BodyInit = new Uint8Array([1, 2, 3])) => s.fetch(path, { method: 'POST', raw, headers: { 'content-type': type } })
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('le cadre photo', () => {
  const photos = async (s: Session) => (await okJson<{ photos: { id: string; key: string; saved_at: number | null }[] }>(s.fetch('/api/photos'))).photos
  const add = (s: Session) => okJson<{ id: string; key: string }>(upload(s, '/api/photos'))

  it('a photo is uploaded, listed, kept, and deleted with its blob', async () => {
    const s = await household('photos-crud', undefined, { empty: true })
    const { id, key } = await add(s)
    expect(await photos(s)).toEqual([expect.objectContaining({ id, key, saved_at: null })])

    await okJson(s.fetch('/api/photos', { method: 'PATCH', body: { id, saved: true } }))
    expect((await photos(s))[0]?.saved_at).toBeGreaterThan(0)
    await okJson(s.fetch('/api/photos', { method: 'PATCH', body: { id, saved: false } }))
    expect((await photos(s))[0]!.saved_at).toBeNull()
    expect((await s.fetch('/api/photos', { method: 'PATCH', body: { id } })).status).toBe(400)

    await okJson(s.fetch('/api/photos', { method: 'DELETE', body: { id } }))
    expect(await photos(s)).toEqual([])
    expect(await stored(key)).toBe(false)
  })

  it('past thirty, the oldest goes, row and blob, so the free tier holds', async () => {
    const s = await household('photos-cap', undefined, { empty: true })
    const first = await add(s)
    await env.DB.prepare('UPDATE photos SET created_at = created_at - 1000 WHERE id = ?').bind(first.id).run()
    for (let i = 0; i < 29; i++) await add(s)
    expect(await photos(s)).toHaveLength(30)
    expect(await stored(first.key)).toBe(true)

    await add(s)
    const after = await photos(s)
    expect(after).toHaveLength(30)
    expect(after.map((p) => p.id)).not.toContain(first.id)
    expect(await stored(first.key)).toBe(false)
  })

  it('takes an image only; a stranger can neither keep nor free one', async () => {
    const s = await household('photos-a', undefined, { empty: true })
    const other = await household('photos-b', undefined, { empty: true })
    expect((await upload(s, '/api/photos', 'audio/webm')).status).toBe(400)
    const { id, key } = await add(s)
    await okJson(other.fetch('/api/photos', { method: 'PATCH', body: { id, saved: true } }))
    await okJson(other.fetch('/api/photos', { method: 'DELETE', body: { id } }))
    expect((await photos(s))[0]).toMatchObject({ id, saved_at: null })
    expect(await stored(key)).toBe(true)
    expect(await photos(other)).toEqual([])
  })
})

describe('un visage en photo', () => {
  const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
  const row = (id: string) => env.DB.prepare('SELECT avatar_kind, avatar_ref FROM members WHERE id = ?').bind(id).first<{ avatar_kind: string; avatar_ref: string }>()

  it('a photo replaces the colour, a new one frees the old, and the member’s delete frees the last', async () => {
    const s = await household('avatar-crud', undefined, { empty: true })
    const id = await member(s, 'Léa')
    const first = await okJson<{ key: string }>(upload(s, `/api/members/avatar?id=${id}`))
    expect(first.key).toMatch(/^av_/)
    expect(await row(id)).toEqual({ avatar_kind: 'photo', avatar_ref: first.key })

    const next = await okJson<{ key: string }>(upload(s, `/api/members/avatar?id=${id}`))
    expect(await stored(first.key)).toBe(false)
    expect((await row(id))!.avatar_ref).toBe(next.key)

    await okJson(s.fetch('/api/members', { method: 'DELETE', body: { id } }))
    expect(await stored(next.key)).toBe(false)
  })

  it('takes an image for a member of ours, under a megabyte', async () => {
    const s = await household('avatar-a', undefined, { empty: true })
    const other = await household('avatar-b', undefined, { empty: true })
    const id = await member(s, 'Léa')
    expect((await upload(s, '/api/members/avatar')).status).toBe(400)
    expect((await upload(s, `/api/members/avatar?id=${id}`, 'text/plain')).status).toBe(400)
    expect((await upload(s, `/api/members/avatar?id=${id}`, 'image/jpeg', new Uint8Array(1024 * 1024 + 1))).status).toBe(400)
    expect((await upload(other, `/api/members/avatar?id=${id}`)).status).toBe(404)
    expect((await row(id))!.avatar_kind, 'none of those changed the face').toBe('color')
  })
})

describe('la pièce jointe d’une remarque', () => {
  it('sorts what it receives under its own prefixes, and frees only those', async () => {
    const s = await household('remark-media', undefined, { empty: true })
    const shot = await okJson<{ key: string; kind: string }>(upload(s, '/api/remark-media', 'image/png'))
    const scene = await okJson<{ key: string; kind: string }>(upload(s, '/api/remark-media', 'application/json'))
    const voice = await okJson<{ key: string; kind: string }>(upload(s, '/api/remark-media', 'audio/webm'))
    expect(shot).toMatchObject({ kind: 'drawing' })
    expect(shot.key).toMatch(/^rm_/)
    expect(scene.key).toMatch(/^rs_/)
    expect(voice.kind).toBe('audio')
    expect((await upload(s, '/api/remark-media', 'text/plain')).status).toBe(400)

    await okJson(s.fetch('/api/remark-media', { method: 'DELETE', body: { key: shot.key } }))
    expect(await stored(shot.key)).toBe(false)
    await okJson(s.fetch('/api/remark-media', { method: 'DELETE', body: { key: shot.key } }))

    await env.PHOTOS!.put('rc_une-recette', new Uint8Array([1]))
    expect((await s.fetch('/api/remark-media', { method: 'DELETE', body: { key: 'rc_une-recette' } })).status, 'a leaked recipe key cannot be deleted here').toBe(400)
    expect(await stored('rc_une-recette')).toBe(true)
  })
})

// P0 #1 (review 2026-11-17): /api/img serves on the app's own origin, so a blob that
// renders as a page (SVG, HTML) was stored XSS under the household's session cookie.
describe('les types servis sur notre origine', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'

  it('an SVG or HTML upload is refused at every door that used to take anything', async () => {
    const s = await household('media-xss', undefined, { empty: true })
    // Each door takes a PNG (the control: a 400 below is about the type, nothing else).
    for (const path of ['/api/note-media', '/api/photos', '/api/recipe-image', '/api/remark-media', '/api/trip-doc-media']) {
      expect((await upload(s, path, 'image/png')).status, `png → ${path}`).toBe(200)
      for (const type of ['image/svg+xml', 'text/html'])
        expect((await upload(s, path, type, svg)).status, `${type} → ${path}`).toBe(400)
    }
  })

  it('an image goes in and comes out as itself, unsniffed and sandboxed', async () => {
    const s = await household('media-ok', undefined, { empty: true })
    const { key } = await okJson<{ key: string }>(upload(s, '/api/note-media', 'image/png'))
    const res = await anon(`/api/img/${key}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toMatch(/^sandbox; default-src 'none'.*, default-src 'self'/)
    await res.arrayBuffer()
  })

  it('a blob already stored as SVG (before the rule) is served as a sandboxed download', async () => {
    const key = 'nm_legacysvg' + Date.now()
    await env.PHOTOS!.put(key, svg, { httpMetadata: { contentType: 'image/svg+xml' } })
    const res = await anon(`/api/img/${key}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toBe('attachment')
    expect(res.headers.get('content-security-policy')).toMatch(/^sandbox; default-src 'none'.*, default-src 'self'/)
    await res.arrayBuffer()
  })
})

// P0 #4 (review 2026-11-17): R2 keys are public, and a cleanup freed whatever key its row
// named. A household could store a key it had SEEN (a child's photo, a nightly backup),
// delete its own row, and erase the other family's blob. Ownership is the ledger (0158).
describe('a household frees only its own blobs', () => {
  const owner = (key: string) => env.DB.prepare('SELECT household_id FROM media_owners WHERE media_key = ?').bind(key).first<{ household_id: string }>()
  const plantNote = async (s: Session, key: string) => {
    const id = `plnt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    await env.DB.prepare("INSERT INTO notes (id, household_id, text, created_at, media_kind, media_key) VALUES (?, ?, '', ?, 'image', ?)").bind(id, s.householdId, Math.floor(Date.now() / 1000), key).run()
    return id
  }

  it('an upload is recorded as its household’s, and its own note frees it', async () => {
    const a = await household('own-a', undefined, { empty: true })
    const { key } = await okJson<{ key: string }>(upload(a, '/api/note-media', 'image/png'))
    expect(await owner(key)).toEqual({ household_id: a.householdId })
    const { id } = await okJson<{ id: string }>(a.fetch('/api/notes', { method: 'POST', body: { media_kind: 'image', media_key: key } }))
    await okJson(a.fetch('/api/notes', { method: 'DELETE', body: { id } }))
    expect(await stored(key)).toBe(false)
    expect(await owner(key)).toBeNull()
  })

  it('a key it only saw is refused at the door, and never freed by its rows', async () => {
    const a = await household('victim-a', undefined, { empty: true })
    const b = await household('thief-b', undefined, { empty: true })
    const { key } = await okJson<{ key: string }>(upload(a, '/api/note-media', 'image/png'))
    // The door.
    expect((await b.fetch('/api/notes', { method: 'POST', body: { media_kind: 'image', media_key: key } })).status).toBe(400)
    // A row that names it anyway (how every row looked before the ledger): its delete frees nothing.
    const id = await plantNote(b, key)
    await okJson(b.fetch('/api/notes', { method: 'DELETE', body: { id } }))
    expect(await stored(key)).toBe(true)
    expect(await owner(key)).toEqual({ household_id: a.householdId })
  })

  it('a nightly backup is no one’s media', async () => {
    const a = await household('backup-a', undefined, { empty: true })
    const b = await household('backup-b', undefined, { empty: true })
    const backup = `backup/${a.householdId}/2026-11-16.json`
    await env.PHOTOS!.put(backup, '{}')
    const id = await plantNote(b, backup)
    await okJson(b.fetch('/api/notes', { method: 'DELETE', body: { id } }))
    expect(await stored(backup)).toBe(true)
    expect((await b.fetch('/api/cercle', { method: 'POST', body: { firstName: 'X', photoKey: backup } })).status).toBe(400)
  })
})

describe('0158 backfill', () => {
  it('claims the keys a household’s rows already name — scalar and inside JSON — and nothing that is not a key', async () => {
    const s = await household('backfill', undefined, { empty: true })
    const now = Math.floor(Date.now() / 1000)
    const tag = `${now}${Math.random().toString(36).slice(2, 6)}`
    await env.DB.prepare("INSERT INTO notes (id, household_id, text, created_at, media_kind, media_key) VALUES (?, ?, '', ?, 'image', ?)").bind(`bfn${tag}`, s.householdId, now, `nm_legacy${tag}`).run()
    await env.DB.prepare("INSERT INTO notes (id, household_id, text, created_at, media_kind, media_key) VALUES (?, ?, '', ?, 'image', ?)").bind(`bfb${tag}`, s.householdId, now, `backup/${s.householdId}/x.json`).run()
    const member = (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))).id
    await env.DB.prepare('INSERT INTO routines (id, household_id, member_id, name, cards_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`bfr${tag}`, s.householdId, member, 'Matin', JSON.stringify([{ label: 'Dents', photoKey: `rcp_legacy${tag}`, img: 'https://example.com/a.png' }]), now).run()
    const backfill = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0158_'))!.queries.filter((q) => /INSERT OR IGNORE INTO media_owners/i.test(q))
    expect(backfill.length).toBeGreaterThan(20)
    for (const q of backfill) await env.DB.prepare(q).run()
    const mine = (await env.DB.prepare('SELECT media_key FROM media_owners WHERE household_id = ?').bind(s.householdId).all<{ media_key: string }>()).results.map((r) => r.media_key)
    expect(mine).toContain(`nm_legacy${tag}`)
    expect(mine).toContain(`rcp_legacy${tag}`)
    expect(mine.filter((k) => k.includes('/') || k.includes(':'))).toEqual([])
  })
})
