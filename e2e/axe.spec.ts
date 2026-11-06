import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { MMID } from './mocks'

// THE WHOLE WCAG A + AA SET, HELD (solidify 7.4, 2026-11-05). contrast.spec holds one rule
// at zero. The matrix runs all of them and only prints. So a violation here fails unless
// e2e/axe-allow.json names its rule, its surface and a reason, and that file only shrinks
// (docCounts pins its size). Contrast stays in contrast.spec, which walks both themes and
// both roles. Plant: remove an entry.
const SURFACES = [
  { name: 'board', route: '/board' },
  { name: 'kitchen', route: '/kitchen' },
  { name: 'recipes', route: '/kitchen?tab=recipes' },
  { name: 'liste', route: '/liste' },
  { name: 'notes', route: '/notes' },
  { name: 'maison', route: '/maison' },
  { name: 'famille', route: '/maison?section=family' },
  { name: 'settings', route: '/settings' },
  { name: 'settings-systeme', route: '/settings?tab=settings' },
  { name: 'day-plan', route: `/kitchen/day/${MMID}` },
  { name: 'recipe-view', route: '/kitchen/recipe/rc1' },
  { name: 'form-recipe', route: '/kitchen/recipe/new' },
  { name: 'form-virement', route: '/virement/new' },
  { name: 'form-routine', route: '/routine/r1' },
  { name: 'trips', route: '/voyage' },
  { name: 'search', route: '/search?q=lait' },
]

interface Allowed {
  rule: string
  surface: string
  reason: string
}
const allowed: Allowed[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'axe-allow.json'), 'utf8'))

test('no unlisted WCAG A/AA violation across the app', async ({ page, app }) => {
  test.setTimeout(SURFACES.length * 8_000)
  await app.boot({ route: '/board', wait: '.hub' })
  const found: string[] = []
  for (const s of SURFACES) {
    await page.goto(s.route)
    await expect(page.locator('.loading, .skeleton')).toHaveCount(0, { timeout: 15_000 })
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze()
    for (const v of res.violations) {
      if (allowed.some((a) => a.rule === v.id && (a.surface === s.name || a.surface === '*'))) continue
      found.push(`${s.name}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    }
  }
  expect(found).toEqual([])
})
