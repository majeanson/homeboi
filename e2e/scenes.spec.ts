import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Surface } from './mocks'

// Standalone full-screen SCENES (real routes, no hub chrome) that none of the
// other sweeps reach: « L'auto », departure mode, the toddler play space, global
// search, « Notre monde » overview, the cercle family/person/pet builders, the
// drawing gallery, multi-cook, the printable recipe book. They take over the whole
// viewport, so a stray wide child overflows the DOCUMENT. This walks each across
// phone / tablet-portrait / wall and:
//   • guards no pageerror (a scene that throws on mount fails here),
//   • asserts no horizontal overflow at the document level,
//   • writes scene-*.png for review of wrap/spacing.
// « L'auto » and departure render POPULATED via the car + todo-templates mocks;
// the rest render whatever state their existing mock data (or empty state) yields —
// either way an empty/loading scene must not overflow or crash.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror while opening a scene').toEqual([])
  },
})

const FORMATS = [
  { name: 'phone', width: 390, height: 844, surface: 'mobile' as Surface },
  { name: 'tablet', width: 834, height: 1112, surface: 'kiosk' as Surface },
  { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as Surface },
]

type Scene = { name: string; path: string; audience?: Audience }
const SCENES: Scene[] = [
  { name: 'voiture', path: '/voiture' },
  // « Diffuser au salon » — the read-only TV board: the real <Board/>, scaled + passive
  // (.cast pointer-events:none, no hub chrome → no FAB). Must render the mocked board
  // without crashing or overflowing at any size (it's shown full-screen on a TV).
  { name: 'cast', path: '/cast' },
  { name: 'departure', path: '/board/departure' },
  { name: 'jouer', path: '/jouer', audience: 'toddler' },
  { name: 'search', path: '/search' },
  { name: 'cercle-monde', path: '/cercle/monde' },
  { name: 'cercle-family-new', path: '/cercle/family/new' },
  { name: 'cercle-person-new', path: '/cercle/person/new' },
  { name: 'cercle-pet-new', path: '/cercle/pet/new' },
  { name: 'drawings', path: '/drawings' },
  { name: 'cook-multi', path: '/kitchen/cook/multi' },
  { name: 'recipe-book', path: '/kitchen/book' },
]

// Full-screen scenes own the viewport — a real overflow shows at the document.
async function docOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth > doc.clientWidth + 1 ? 'doc-overflow' : 'ok'
  })
}

for (const format of FORMATS) {
  for (const scene of SCENES) {
    test(`scene-${scene.name}-${format.name}`, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: scene.audience ?? 'parent', lang: 'fr', calm: true, surface: format.surface })
      await page.goto(scene.path)
      // Scenes render standalone (no .hub); wait for the common scene shells. A scene
      // that needs data it lacks may show its own empty state — still a valid layout
      // to check — so don't hard-fail on a missing root, just settle.
      await page.locator('.scene, .cook, main, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
      await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
      await page.waitForTimeout(600)
      await page.screenshot({ path: `e2e/screenshots/scene-${scene.name}-${format.name}.png`, fullPage: true })
      await expect.poll(() => docOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })
  }
}
