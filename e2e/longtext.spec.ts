import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Surface } from './mocks'

// Screenshot-review loop, iteration 5: LONG-TEXT stress. Every text field carries
// a long phrase + an unbreakable long word (mockApi({ longText: true })). Catches
// truncation/overflow/word-break bugs the tidy fixtures hide. The hard assertion
// is "no horizontal overflow" (doc + the hub scroller); screenshots (lt-*.png)
// are for eyeballing vertical/wrap issues. Crash-smoke guarded.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(page)
    expect(errors, 'pageerror under long text').toEqual([])
  },
})

const FORMATS = [
  { name: 'phone', w: 390, h: 844, surface: 'mobile' as Surface },
  { name: 'wall', w: 1280, h: 800, surface: 'kiosk' as Surface },
]

async function noHOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.querySelector('.hub__body')
    if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
    if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow'
    return 'ok'
  })
}

const SURFACES = ['/board', '/kitchen', '/routines', '/liste', '/settings']

for (const f of FORMATS) {
  for (const path of SURFACES) {
    test(`lt ${f.name}: ${path.slice(1)}`, async ({ page }) => {
      await page.setViewportSize({ width: f.w, height: f.h })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: f.surface })
      await page.goto(path)
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `e2e/screenshots/lt-${f.name}-${path.slice(1)}.png`, fullPage: false })
      await expect.poll(() => noHOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })
  }
}

// Densest overlays with long content: the recipe sheet (long title + ingredients)
// and the cashier review (long deal + item names).
test('lt phone: recipe sheet long title', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { longText: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/kitchen')
  await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  const card = page.locator('.recipe-card').first()
  if (await card.count()) {
    await card.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/screenshots/lt-recipe-sheet.png', fullPage: false })
  }
})

test('lt phone: cashier review long names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { longText: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: /Montrer/ }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/screenshots/lt-cashier-review.png', fullPage: false })
})
