import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// LES NOTES against a real D1 and R2: durable, scoped to one face or to the Maisonnée, in
// the order a household dragged them, each owning at most one attachment.

interface Note {
  id: string
  member_id: string | null
  author_member_id: string | null
  title: string
  text: string
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  position: number
}

const notes = async (s: Session) => (await okJson<{ notes: Note[]; more: boolean }>(s.fetch('/api/family-notes'))).notes
const one = async (s: Session, id: string) => (await notes(s)).find((n) => n.id === id)
const add = async (s: Session, body: Record<string, unknown>, headers?: Record<string, string>) =>
  (await okJson<{ id: string }>(s.fetch('/api/family-notes', { method: 'POST', body: { text: 'Code du cadenas', scope: 'family', ...body }, headers }))).id
const patch = (s: Session, body: Record<string, unknown>) => s.fetch('/api/family-notes', { method: 'PATCH', body })
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id
const blob = async (s: Session, type = 'image/png') => (await okJson<{ key: string }>(s.fetch('/api/note-media', { method: 'POST', raw: new Uint8Array([1, 2]), headers: { 'content-type': type } }))).key
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('une note', () => {
  it('is written, read, edited, and soft-cleared', async () => {
    const s = await household('fnotes-crud', undefined, { empty: true })
    const id = await add(s, { title: '  Wifi  ', text: '  **maison123**  ' })
    expect(await one(s, id)).toMatchObject({ title: 'Wifi', text: '**maison123**', member_id: null, media_kind: null })

    await okJson(patch(s, { id, text: 'nouveau mot de passe' }))
    expect(await one(s, id), 'a text edit leaves the title').toMatchObject({ title: 'Wifi', text: 'nouveau mot de passe' })

    await okJson(s.fetch('/api/family-notes', { method: 'DELETE', body: { id } }))
    expect(await notes(s)).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM family_notes WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first(), 'cleared, not erased').not.toBeNull()
    expect((await patch(s, { id, title: 'Revenante' })).status, 'a cleared note takes no more edits').toBe(404)
  })

  it('refuses a note with nothing in it, and caps what it holds', async () => {
    const s = await household('fnotes-empty', undefined, { empty: true })
    expect((await s.fetch('/api/family-notes', { method: 'POST', body: { title: ' ', text: ' ' } })).status).toBe(400)
    expect((await patch(s, { id: 'x' })).status, 'an edit that says nothing').toBe(400)
    const id = await add(s, { title: 't'.repeat(200), text: 'x'.repeat(3000) })
    const n = (await one(s, id))!
    expect(n.title).toHaveLength(120)
    expect(n.text).toHaveLength(2000)
  })

  it('a stranger’s note is a 404 and cannot be cleared', async () => {
    const s = await household('fnotes-a', undefined, { empty: true })
    const other = await household('fnotes-b', undefined, { empty: true })
    const key = await blob(s)
    const id = await add(s, { media_kind: 'image', media_key: key })
    expect((await patch(other, { id, title: 'Volée' })).status).toBe(404)
    await okJson(other.fetch('/api/family-notes', { method: 'DELETE', body: { id } }))
    expect((await one(s, id))?.media_key).toBe(key)
    expect(await stored(key), 'nor its blob freed').toBe(true)
  })
})

describe('le destinataire', () => {
  it('the composer’s toggle beats the face at the device; the author stays who wrote it', async () => {
    const s = await household('fnotes-scope', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const marc = await member(s, 'Marc')
    const atDevice = { 'X-Profile': marc }

    const family = await add(s, { scope: 'family', member_id: lea }, atDevice)
    expect(await one(s, family), '« Maisonnée » is nobody in particular').toMatchObject({ member_id: null, author_member_id: marc })

    const picked = await add(s, { scope: 'self', member_id: lea }, atDevice)
    expect(await one(s, picked)).toMatchObject({ member_id: lea, author_member_id: marc })

    const moi = await add(s, { scope: 'self' }, atDevice)
    expect((await one(s, moi))!.member_id, 'nobody picked: the face at the device').toBe(marc)

    await okJson(patch(s, { id: picked, scope: 'family' }))
    expect(await one(s, picked), 're-scoping changes who it is FOR, not who wrote it').toMatchObject({ member_id: null, author_member_id: marc })
    await okJson(patch(s, { id: picked, scope: 'self', member_id: lea }))
    expect((await one(s, picked))!.member_id).toBe(lea)
  })

  it('a stranger’s member never becomes the scope', async () => {
    const s = await household('fnotes-foreign', undefined, { empty: true })
    const other = await household('fnotes-foreign-b', undefined, { empty: true })
    const zoe = await member(other, 'Zoé')
    const id = await add(s, { scope: 'self', member_id: zoe })
    expect((await one(s, id))!.member_id).toBeNull()
  })
})

describe('l’ordre', () => {
  it('newest first until someone drags, and a drag is kept', async () => {
    const s = await household('fnotes-order', undefined, { empty: true })
    const a = await add(s, { title: 'A' })
    const b = await add(s, { title: 'B' })
    await env.DB.prepare('UPDATE family_notes SET created_at = created_at - 60 WHERE id = ?').bind(a).run()
    expect((await notes(s)).map((n) => n.title)).toEqual(['B', 'A'])

    await okJson(patch(s, { id: a, position: 0 }))
    await okJson(patch(s, { id: b, position: 1 }))
    expect((await notes(s)).map((n) => n.title)).toEqual(['A', 'B'])
    await okJson(patch(s, { id: b, position: -4.7 }))
    expect((await one(s, b))!.position, 'never below the top').toBe(0)
  })
})

describe('la pièce jointe', () => {
  it('a media-only note stands alone; a drawing keeps its scene, an image never has one', async () => {
    const s = await household('fnotes-media', undefined, { empty: true })
    const png = await blob(s)
    const scene = await blob(s, 'application/json')
    expect(scene).toMatch(/^ns_/)
    const drawn = await add(s, { text: '', media_kind: 'drawing', media_key: png, scene_key: scene })
    expect(await one(s, drawn)).toMatchObject({ text: '', media_kind: 'drawing', media_key: png, scene_key: scene })

    const photo = await blob(s)
    const shot = await add(s, { text: '', media_kind: 'image', media_key: photo, scene_key: scene })
    expect((await one(s, shot))!.scene_key).toBeNull()
    expect((await s.fetch('/api/family-notes', { method: 'POST', body: { text: '', media_kind: 'video', media_key: photo } })).status, 'not a kind we keep').toBe(400)
  })

  it('replacing frees the old blobs, removing frees them and leaves the words, clearing frees the rest', async () => {
    const s = await household('fnotes-free', undefined, { empty: true })
    const png = await blob(s)
    const scene = await blob(s, 'application/json')
    const id = await add(s, { media_kind: 'drawing', media_key: png, scene_key: scene })

    const next = await blob(s)
    await okJson(patch(s, { id, media_kind: 'image', media_key: next }))
    expect(await one(s, id)).toMatchObject({ media_kind: 'image', media_key: next, scene_key: null })
    expect(await stored(png)).toBe(false)
    expect(await stored(scene)).toBe(false)
    expect(await stored(next)).toBe(true)

    expect((await patch(s, { id, media_kind: 'image', media_key: 'pas une clé !' })).status).toBe(400)
    expect(await stored(next), 'a refused edit frees nothing').toBe(true)

    await okJson(patch(s, { id, media_kind: null }))
    expect(await one(s, id)).toMatchObject({ text: 'Code du cadenas', media_kind: null, media_key: null })
    expect(await stored(next)).toBe(false)

    const last = await blob(s)
    await okJson(patch(s, { id, media_kind: 'image', media_key: last }))
    await okJson(s.fetch('/api/family-notes', { method: 'DELETE', body: { id } }))
    expect(await stored(last)).toBe(false)
  })

  it('a text edit leaves the attachment alone; an old client’s bare redraw keeps the kind', async () => {
    const s = await household('fnotes-legacy', undefined, { empty: true })
    const png = await blob(s)
    const id = await add(s, { media_kind: 'drawing', media_key: png })
    await okJson(patch(s, { id, title: 'Titre' }))
    expect((await one(s, id))!.media_key).toBe(png)
    expect(await stored(png)).toBe(true)

    const redrawn = await blob(s)
    await okJson(patch(s, { id, media_key: redrawn }))
    expect(await one(s, id)).toMatchObject({ media_kind: 'drawing', media_key: redrawn })
    expect(await stored(png)).toBe(false)
  })
})
