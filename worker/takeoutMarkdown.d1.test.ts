import { describe, it, expect } from 'vitest'
import { anon, household } from '../functions/test/d1'

// « Emporter mes données » — the readable twin, through the real entry: operator-only,
// served as a download, and built from the SAME dump as the JSON (so a recipe the household
// really holds is in it, and another household's is not).
describe('GET /api/takeout?format=md', () => {
  it('serves the household’s recipes and list as a Markdown download', async () => {
    const mine = await household('md', undefined, { empty: true })
    const other = await household('md-other', undefined, { empty: true })
    await mine.fetch('/api/recipes', { method: 'POST', body: { title: 'Soupe aux pois de Maman', ingredients: ['2 tasses de pois'], steps: ['Mijoter'] } })
    await other.fetch('/api/recipes', { method: 'POST', body: { title: 'Recette des voisins', ingredients: ['x'], steps: ['y'] } })
    await mine.fetch('/api/list', { method: 'POST', body: { text: 'Beurre' } })

    const res = await mine.fetch('/api/takeout?format=md')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="babillard-\d{4}-\d{2}-\d{2}\.md"/)
    const md = await res.text()
    expect(md).toContain('### Soupe aux pois de Maman')
    expect(md).toContain('- 2 tasses de pois')
    expect(md).toContain('- [ ] Beurre')
    expect(md).not.toContain('Recette des voisins')

    const en = await (await mine.fetch('/api/takeout?format=md&lang=en')).text()
    expect(en).toContain('## Recipes (1)')
  })

  it('stays operator-only — no session, no file', async () => {
    const res = await anon('/api/takeout?format=md')
    expect(res.status).toBe(401)
  })
})
