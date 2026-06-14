import { test, type Page } from '@playwright/test'
import { mockApi, seedState, type Theme } from './mocks'

// One-off capture of the welcome/marketing front door (the brand-new-visitor
// Home). NOT seeding a surface keeps `chosen` false so Entry renders <Home>
// instead of redirecting to /board. Writes e2e/screenshots/home-*.png.

const PHONE = { width: 390, height: 844 }
const WIDE = { width: 1000, height: 900 }

async function boot(page: Page, theme: Theme, format: { width: number; height: number }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(format)
  await mockApi(page)
  // Brand-new visitor: signed-out (Entry shows <Home> only when not signed in).
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await seedState(page, { theme, lang: 'fr', calm: true }) // no surface → not "chosen"
  await page.goto('/')
  await page.locator('.home').waitFor({ state: 'visible', timeout: 15_000 })
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(150)
}

for (const theme of ['day', 'night'] as Theme[]) {
  const sfx = theme === 'night' ? '-night' : ''
  test(`home-phone${sfx}`, async ({ page }) => {
    await boot(page, theme, PHONE)
    await page.screenshot({ path: `e2e/screenshots/home-phone${sfx}.png`, fullPage: true })
  })
  test(`home-wide${sfx}`, async ({ page }) => {
    await boot(page, theme, WIDE)
    await page.screenshot({ path: `e2e/screenshots/home-wide${sfx}.png`, fullPage: true })
  })
}
