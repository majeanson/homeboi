import { test } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Quick visual check that the cashier review CTA now lives in the TOP bar next to
// ✕ (moved off the iOS-toolbar-covered bottom edge). Offline mock; one staged deal.
test('cashier review CTA is in the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
  await page.goto('/liste')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Montrer/ }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e/screenshots/check-cashier-review-top.png', fullPage: false })
})
