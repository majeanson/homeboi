import { describe, it, expect } from 'vitest'
import { anon, household } from '../functions/test/d1'

// The shell carries a BASELINE link card (index.html: og:image → /og.jpg, twitter:card…).
// A /partage/<id> link must replace it, not sit after it: crawlers read the FIRST og: tag,
// so a share that merely APPENDED its own tags unfurled as the generic app.
describe('link previews', () => {
  it('the bare door carries the app card', async () => {
    const html = await (await anon('/')).text()
    expect(html).toContain('property="og:image" content="https://babillard.marcportal.com/og.jpg"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
  })

  it('a share replaces the baseline card instead of trailing it', async () => {
    const s = await household('og', undefined, { empty: true })
    const made = await s.fetch('/api/recipes', {
      method: 'POST',
      body: { title: 'Pâté chinois du dimanche', ingredients: ['1 lb de boeuf'], steps: ['Cuire'] },
    })
    expect(made.status).toBeLessThan(300)
    const recipeId = ((await made.json()) as { id?: string; recipe?: { id: string } }).id ?? ''
    const share = await s.fetch('/api/share', { method: 'POST', body: { kind: 'recipe', recipeId } })
    expect(share.status).toBe(200)
    const { id } = (await share.json()) as { id: string }

    const html = await (await anon(`/partage/${id}`)).text()
    const ogTitles = html.match(/property="og:title"/g) ?? []
    expect(ogTitles.length, 'one og:title, not the baseline plus the share').toBe(1)
    expect(html).toContain('Pâté chinois du dimanche')
    // No photo on this recipe → the share falls back to the app card, and there is ONE.
    expect((html.match(/property="og:image"/g) ?? []).length).toBe(1)
    expect(html).toContain('/og.jpg')
    expect((html.match(/name="twitter:card"/g) ?? []).length).toBe(1)
  })
})
