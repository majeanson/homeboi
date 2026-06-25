import { test } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Quick visual check that "Montrer à la caisse" opens the picks GRID (random-access
// proof, not a sequential stepper). Offline mock; one staged deal.
test('cashier opens the picks grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Montrer/ }).first().click()
  await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 5000 })
  await page.screenshot({ path: 'e2e/screenshots/check-cashier-grid.png', fullPage: false })
})
