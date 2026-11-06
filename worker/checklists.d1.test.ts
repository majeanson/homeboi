import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// LES MODÈLES ET LE FANTÔME against a real D1: a reusable checklist that becomes real
// todos when used, and the opt-in purchase list, which suggests and never adds.

type Item = { kind: 'item'; label: string } | { kind: 'ref'; refId: string }
const templates = async (s: Session) => (await okJson<{ templates: { id: string; title: string; items: Item[] }[] }>(s.fetch('/api/todo-templates'))).templates
const add = async (s: Session, title: string, items: unknown) => (await okJson<{ id: string }>(s.fetch('/api/todo-templates', { method: 'POST', body: { title, items } }))).id

describe('un modèle « Avant de partir »', () => {
  it('is created, read as items, edited whole, and removed', async () => {
    const s = await household('tpl-crud', undefined, { empty: true })
    const other = await add(s, 'Autre', [])
    const id = await add(s, '  Avant de partir  ', ['  Clés  ', { label: ' Lunch ' }, { ref: other }, '', 7, { nothing: true }])
    const tpl = (await templates(s)).find((t) => t.id === id)!
    expect(tpl.title).toBe('Avant de partir')
    expect(tpl.items).toEqual([{ kind: 'item', label: 'Clés' }, { kind: 'item', label: 'Lunch' }, { kind: 'ref', refId: other }])

    await okJson(s.fetch('/api/todo-templates', { method: 'PATCH', body: { id, title: 'Départ', items: ['Sac'] } }))
    expect((await templates(s)).find((t) => t.id === id)).toMatchObject({ title: 'Départ', items: [{ kind: 'item', label: 'Sac' }] })
    await okJson(s.fetch('/api/todo-templates', { method: 'PATCH', body: { id, title: 'Renommé' } }))
    expect((await templates(s)).find((t) => t.id === id)!.items, 'a rename leaves the list').toHaveLength(1)

    await okJson(s.fetch('/api/todo-templates', { method: 'DELETE', body: { id } }))
    expect((await templates(s)).map((t) => t.id)).toEqual([other])
  })

  it('needs a title, caps its size, and a stranger’s id changes nothing', async () => {
    const s = await household('tpl-a', undefined, { empty: true })
    const other = await household('tpl-b', undefined, { empty: true })
    expect((await s.fetch('/api/todo-templates', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    const id = await add(s, 'Gros', Array.from({ length: 80 }, (_, i) => `Item ${i}`))
    expect((await templates(s))[0].items).toHaveLength(50)
    await okJson(other.fetch('/api/todo-templates', { method: 'PATCH', body: { id, title: 'Volé', items: [] } }))
    await okJson(other.fetch('/api/todo-templates', { method: 'DELETE', body: { id } }))
    expect((await templates(s))[0]).toMatchObject({ title: 'Gros' })
    expect(await templates(other)).toEqual([])
  })

  it('used, it becomes real todos under its title, nested templates included, a deleted one skipped', async () => {
    const s = await household('tpl-use', undefined, { empty: true })
    const inner = await add(s, 'Bébé', ['Couches'])
    const gone = await add(s, 'Disparu', ['Fantôme'])
    const id = await add(s, 'Avant de partir', ['Clés', { ref: inner }, { ref: gone }])
    await okJson(s.fetch('/api/todo-templates', { method: 'DELETE', body: { id: gone } }))

    await okJson(s.fetch('/api/todos', { method: 'POST', body: { templateId: id } }))
    const { results } = await env.DB.prepare('SELECT title, section FROM todos WHERE household_id = ? ORDER BY position, created_at').bind(s.householdId).all<{ title: string; section: string | null }>()
    const titles = results.map((r) => r.title)
    expect(titles).toContain('Clés')
    expect(titles).toContain('Couches')
    expect(titles).not.toContain('Fantôme')
    expect(results.find((r) => r.title === 'Clés')!.section).toBe('Avant de partir')
  })
})

describe('le fantôme', () => {
  type Ghost = { key: string; label: string }
  type Managed = Ghost & { cadenceDays: number | null; source: string; muted: boolean; standing: boolean; count: number }
  const strip = (s: Session) => okJson<{ ghosts: Ghost[]; staples: Ghost[] }>(s.fetch('/api/ghost'))
  const manage = (s: Session) => okJson<{ items: Managed[]; candidates: unknown[] }>(s.fetch('/api/ghost?view=manage'))
  const put = (s: Session, body: Record<string, unknown>) => okJson<{ key: string }>(s.fetch('/api/ghost', { method: 'PATCH', body }))
  const listTexts = async (s: Session) => (await env.DB.prepare('SELECT text FROM list_items WHERE household_id = ?').bind(s.householdId).all<{ text: string }>()).results.map((r) => r.text)

  it('a tracked item is added, tuned, muted, and removed, and the list never hears of it', async () => {
    const s = await household('ghost-crud', undefined, { empty: true })
    const { key } = await put(s, { label: '  Café moulu  ', cadenceDays: 14 })
    const row = (await manage(s)).items.find((i) => i.key === key)!
    expect(row).toMatchObject({ label: 'Café moulu', cadenceDays: 14, source: 'manual', muted: false })
    expect(await listTexts(s), 'suggest-only, never auto-adds').toEqual([])

    await put(s, { key, label: 'Café moulu', cadenceDays: 9999, muted: true })
    expect((await manage(s)).items.find((i) => i.key === key), 'a year is the ceiling').toMatchObject({ cadenceDays: 365, muted: true })

    await okJson(s.fetch('/api/ghost', { method: 'DELETE', body: { key } }))
    expect((await manage(s)).items.map((i) => i.key)).not.toContain(key)
    expect((await s.fetch('/api/ghost', { method: 'PATCH', body: {} })).status).toBe(400)
    expect((await s.fetch('/api/ghost', { method: 'DELETE', body: {} })).status).toBe(400)
  })

  it('a standing staple is offered until it is on the list, and tuning it does not unpin it', async () => {
    const s = await household('ghost-standing', undefined, { empty: true })
    const { key } = await put(s, { label: 'Lait', standing: true })
    expect((await strip(s)).staples.map((g) => g.key)).toEqual([key])

    await put(s, { key, label: 'Lait', cadenceDays: 7 })
    expect((await strip(s)).staples, 'tuning cadence cannot silently unpin').toHaveLength(1)

    await okJson(s.fetch('/api/list', { method: 'POST', body: { text: 'Lait' } }))
    expect((await strip(s)).staples, 'you do not restock what is already there').toEqual([])
  })

  it('buying alone enrolls nothing: tracking is a conscious step', async () => {
    const s = await household('ghost-optin', undefined, { empty: true })
    const a = await okJson<{ id: string }>(s.fetch('/api/list', { method: 'POST', body: { text: 'Rutabaga' } }))
    await okJson(s.fetch('/api/list', { method: 'PATCH', body: { id: a.id, checked: true } }))
    await okJson(s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: [a.id], items: [{ id: a.id, text: 'Rutabaga' }], asOf: Math.floor(Date.now() / 1000) } }))
    expect(await listTexts(s), 'cleared and logged').toEqual([])
    expect((await manage(s)).items.map((i) => i.label)).not.toContain('Rutabaga')
  })

  it('stays in its household', async () => {
    const s = await household('ghost-a', undefined, { empty: true })
    const other = await household('ghost-b', undefined, { empty: true })
    const { key } = await put(s, { label: 'Café moulu' })
    await okJson(other.fetch('/api/ghost', { method: 'DELETE', body: { key } }))
    expect((await manage(s)).items.map((i) => i.key)).toContain(key)
    expect((await manage(other)).items.map((i) => i.key)).not.toContain(key)
  })
})
