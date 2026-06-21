import { test, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// Visual sweep for « Le cercle » — NOT covered by screenshots.spec.ts (which has no
// /cercle stub). Shoots the populated people graph so the new family COLOURS + the
// generational grouping are actually visible: the Liste directory, the Liens (ego)
// graph, and the Arbre (tree). Famille (Maisonnée + Famille Tremblay) and Social
// (Amis / Collègues / Autres), day + night, phone + wall. Writes PNGs to
// e2e/screenshots/cercle-*.png for human/agent review.

const THEMES: Theme[] = ['day', 'night']
const FORMATS = [
  { name: 'phone', width: 390, height: 844, surface: 'mobile' as const },
  { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as const },
]

// section × view states worth a frame. Tree/links carry the new colour+grouping work.
const STATES = [
  { name: 'family-list', q: 'section=family&view=list', ready: '.cercle-group' },
  { name: 'family-tree', q: 'section=family&view=tree', ready: '.cercle-tree__svg' },
  { name: 'family-links', q: 'section=family&view=links', ready: '.cercle-ego__svg' },
  { name: 'social-list', q: 'section=social&view=list', ready: '.cercle-group' },
]

async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(500)
}

for (const state of STATES) {
  for (const theme of THEMES) {
    for (const format of FORMATS) {
      const label = `cercle-${state.name}-${theme}-${format.name}`
      test(label, async ({ page }) => {
        await page.setViewportSize({ width: format.width, height: format.height })
        await mockApi(page)
        await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: format.surface })
        await page.goto(`/cercle?${state.q}`)
        await settle(page, state.ready)
        await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
      })
    }
  }
}

// Toddler « Qui est-ce ? » faces grid — its own audience/layout, day + night phone.
for (const theme of THEMES) {
  const label = `cercle-toddler-${theme}-phone`
  test(label, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme, audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/cercle')
    await settle(page, '.cercle-kid__grid')
    await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
  })
}
