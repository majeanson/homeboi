import { test, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Visual capture of the overlay surfaces (sheets/modals) that screenshots.spec
// can't reach because they only exist after an interaction. Phone format — these
// are phone-first surfaces. Writes PNGs to e2e/screenshots for review; not
// pixel-regression. Run: npx playwright test sheets.spec.ts

const PHONE = { width: 390, height: 844 }

async function boot(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize(PHONE)
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto(path)
  await page.locator('.hub, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

const shoot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/${name}.png` })

test('sheet-add-capture', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.qcap').click()
  await page.locator('.sheet__field input').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-add-capture-phone')
})

test('sheet-add-event', async ({ page }) => {
  await boot(page, '/board')
  await page.locator('.qcap').click()
  await page.locator('.sheet__field input').waitFor({ state: 'visible' })
  await page.locator('.cat-pick').nth(1).click()
  await page.locator('.sheet input[type="date"]').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-add-event-phone')
})

test('sheet-recipe', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-recipe-phone')
})

test('sheet-cook', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.subtabs__opt', { hasText: 'Recettes' }).click()
  await page.locator('.recipe-card').first().click()
  await page.locator('.recipe-modal').waitFor({ state: 'visible' })
  await page.locator('.recipe-actions .btn--primary').click()
  await page.locator('.cook').waitFor({ state: 'visible' })
  await page.waitForTimeout(300)
  await shoot(page, 'sheet-cook-phone')
})

test('sheet-deals', async ({ page }) => {
  await boot(page, '/liste')
  await page.getByRole('button', { name: /Parcourir/ }).click()
  await page.waitForTimeout(600)
  await shoot(page, 'sheet-deals-phone')
})
