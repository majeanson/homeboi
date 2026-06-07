import { test, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Capture each Settings section (the CRUD strips behind the section nav) — they
// only render one at a time, so the static sweep only ever shoots the first.
// Phone format. Writes PNGs to e2e/screenshots for review.

const PHONE = { width: 390, height: 844 }
const SECTIONS = [
  'household', 'agenda', 'chores', 'routines', 'shopping',
  'ghost', 'devices', 'photos', 'recap', 'display', 'calm',
]

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/settings')
  await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

SECTIONS.forEach((id, i) => {
  test(`settings-${id}`, async ({ page }) => {
    await boot(page)
    await page.locator('.operator__tab').nth(i).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `e2e/screenshots/settings-${id}-phone.png` })
  })
})
