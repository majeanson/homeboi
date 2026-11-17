import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// Review #13 (2026-11-17): an imported recipe kept its transcript's markup. « # Tarte au
// gruau » sorted first in the book and was read aloud with its hash; a step read
// `\(180^{\circ}C\)`. The words are cleaned coming in (the save), going out (every
// read, so an old row is clean without a rewrite), and 0161 rewrites stored titles.

type Recipe = { id: string; title: string; ingredients: string[]; steps: string[] }
const list = async (s: Session) => (await okJson<{ recipes: Recipe[] }>(s.fetch('/api/recipes'))).recipes
const plant = (s: Session, id: string, title: string, steps: string[]) =>
  env.DB.prepare('INSERT INTO recipes (id, household_id, title, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)')
    .bind(id, s.householdId, title, JSON.stringify(steps))
    .run()

describe('a recipe reads without its import markup', () => {
  it('a « # » title is saved without the mark', async () => {
    const s = await household('rt-save', undefined, { empty: true })
    const { id } = await okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: '# Tarte au gruau', ingredients: [], steps: [] } }))
    const row = await env.DB.prepare('SELECT title FROM recipes WHERE id = ?').bind(id).first<{ title: string }>()
    expect(row?.title).toBe('Tarte au gruau')
  })

  it('a row stored before the rule reads clean, sections kept', async () => {
    const s = await household('rt-read', undefined, { empty: true })
    await plant(s, `rt${Date.now()}`, '## Soupe', ['## Bouillon', 'Préchauffer à \\(180^{\\circ}C\\).'])
    const [r] = await list(s)
    expect(r?.title).toBe('Soupe')
    expect(r?.steps).toEqual(['## Bouillon', 'Préchauffer à 180°C.'])
  })

  it('0161 rewrites a stored « # » title, and leaves « #1 des tartes » alone', async () => {
    const s = await household('rt-0161', undefined, { empty: true })
    const tag = Date.now()
    await plant(s, `ra${tag}`, '# Tarte au gruau', [])
    await plant(s, `rb${tag}`, '#1 des tartes', [])
    for (const q of env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0161_'))!.queries) await env.DB.prepare(q).run()
    const rows = await env.DB.prepare('SELECT id, title FROM recipes WHERE household_id = ? ORDER BY id').bind(s.householdId).all<{ title: string }>()
    expect(rows.results.map((r) => r.title)).toEqual(['Tarte au gruau', '#1 des tartes'])
  })
})
