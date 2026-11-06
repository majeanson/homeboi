import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'

// LES DESSINS against a real D1 and R2: the upload door every fridge note and kept drawing
// shares, the gallery, and the rule that a drawing owns its blobs, so freeing one is that
// row's business and nobody else's.

interface Drawing {
  id: string
  member_id: string | null
  media_key: string
  scene_key: string | null
  created_at: number
  saved_at: number | null
}

const gallery = async (s: Session) => (await okJson<{ drawings: Drawing[]; more: boolean }>(s.fetch('/api/drawings'))).drawings
const one = async (s: Session, id: string) => (await gallery(s)).find((d) => d.id === id)
const upload = (s: Session, type: string, bytes: BodyInit = new Uint8Array([9, 8, 7])) => s.fetch('/api/note-media', { method: 'POST', raw: bytes, headers: { 'content-type': type } })
const blob = async (s: Session, type = 'image/png') => okJson<{ key: string; kind: string }>(upload(s, type))
const keep = async (s: Session, media_key: string, scene_key?: string, headers?: Record<string, string>) =>
  (await okJson<{ id: string }>(s.fetch('/api/drawings', { method: 'POST', body: { media_key, scene_key }, headers }))).id
const patch = (s: Session, body: Record<string, unknown>, headers?: Record<string, string>) => s.fetch('/api/drawings', { method: 'PATCH', body, headers })
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('le téléversement', () => {
  it('sorts by what it receives, and each comes back served under its own type', async () => {
    const s = await household('media-kinds', undefined, { empty: true })
    const audio = await blob(s, 'audio/webm')
    const png = await blob(s, 'image/png')
    const scene = await blob(s, 'application/json')
    expect([audio.kind, png.kind, scene.kind]).toEqual(['audio', 'drawing', 'scene'])
    expect(audio.key).toMatch(/^nm_/)
    expect(scene.key, 'the editable scene is addressed apart').toMatch(/^ns_/)

    const served = await anon(`/api/img/${audio.key}`)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('audio/webm')
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([9, 8, 7])
  })

  it('refuses another kind of file, an empty one, and one over the cap', async () => {
    const s = await household('media-refuse', undefined, { empty: true })
    expect((await upload(s, 'text/plain')).status).toBe(400)
    expect((await upload(s, 'image/png', new Uint8Array(0))).status).toBe(400)
    expect((await upload(s, 'image/png', new Uint8Array(3 * 1024 * 1024 + 1))).status).toBe(400)
  })

  it('frees an abandoned upload, and only ever one of its own prefixes', async () => {
    const s = await household('media-free', undefined, { empty: true })
    const abandoned = await blob(s)
    const avatar = 'av_pas-une-note'
    await env.PHOTOS!.put(avatar, new Uint8Array([1]))

    await okJson(s.fetch('/api/note-media', { method: 'DELETE', body: { key: abandoned.key } }))
    expect(await stored(abandoned.key)).toBe(false)
    await okJson(s.fetch('/api/note-media', { method: 'DELETE', body: { key: abandoned.key } }))

    expect((await s.fetch('/api/note-media', { method: 'DELETE', body: { key: avatar } })).status, 'never an avatar whose key leaked here').toBe(400)
    expect(await stored(avatar)).toBe(true)
    expect((await s.fetch('/api/note-media', { method: 'DELETE', body: { key: '../etc' } })).status).toBe(400)
  })
})

describe('la galerie', () => {
  it('keeps a drawing, reads it back, resurfaces a continued one, and removes it with its blobs', async () => {
    const s = await household('drawings-crud', undefined, { empty: true })
    const lea = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    const first = await blob(s)
    const scene = await blob(s, 'application/json')
    const id = await keep(s, first.key, scene.key, { 'X-Profile': lea.id })
    expect(await one(s, id)).toMatchObject({ member_id: lea.id, media_key: first.key, scene_key: scene.key, saved_at: null })

    const other = await keep(s, (await blob(s)).key)
    await env.DB.prepare('UPDATE drawings SET created_at = created_at - 100 WHERE id = ?').bind(id).run()
    expect((await gallery(s)).map((d) => d.id), 'newest first').toEqual([other, id])

    const next = await blob(s)
    await okJson(patch(s, { id, media_key: next.key }))
    expect(await one(s, id), 're-tinted to whoever edited').toMatchObject({ member_id: null, media_key: next.key, scene_key: null })
    expect(await stored(first.key)).toBe(false)
    expect(await stored(scene.key)).toBe(false)
    expect(await stored(next.key)).toBe(true)
    await env.DB.prepare('UPDATE drawings SET created_at = created_at - 200 WHERE id = ?').bind(other).run()
    expect((await gallery(s))[0].id, 'a continued drawing leads').toBe(id)

    // Continued with a scene, so the DELETE below has both blobs to free.
    const nextScene = await blob(s, 'application/json')
    await okJson(patch(s, { id, media_key: next.key, scene_key: nextScene.key }))
    expect(await stored(next.key), 'the same PNG is kept, not freed').toBe(true)

    await okJson(s.fetch('/api/drawings', { method: 'DELETE', body: { id } }))
    expect(await one(s, id)).toBeUndefined()
    expect(await stored(next.key)).toBe(false)
    expect(await stored(nextScene.key)).toBe(false)
  })

  it('« Garder » is a flag: it moves no blob and comes off again', async () => {
    const s = await household('drawings-keep', undefined, { empty: true })
    const png = await blob(s)
    const id = await keep(s, png.key)
    await okJson(patch(s, { id, saved: true }))
    expect((await one(s, id))!.saved_at).toBeGreaterThan(0)
    expect((await one(s, id))!.media_key).toBe(png.key)
    await okJson(patch(s, { id, saved: false }))
    expect((await one(s, id))!.saved_at).toBeNull()
    expect(await stored(png.key)).toBe(true)
  })

  it('refuses a bad key; a stranger can neither continue a drawing nor free its blobs', async () => {
    const s = await household('drawings-a', undefined, { empty: true })
    const other = await household('drawings-b', undefined, { empty: true })
    expect((await s.fetch('/api/drawings', { method: 'POST', body: { media_key: 'pas une clé !' } })).status).toBe(400)
    const png = await blob(s)
    const id = await keep(s, png.key)

    expect((await patch(other, { id, media_key: (await blob(other)).key })).status).toBe(404)
    await okJson(other.fetch('/api/drawings', { method: 'DELETE', body: { id } }))
    expect((await one(s, id))?.media_key).toBe(png.key)
    expect(await stored(png.key)).toBe(true)
  })
})
