import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Regression: the guided tour must NOT swallow taps. Its step 2 spotlights the
// bottom nav (data-tour="hubnav"); before the fix the full-screen scrim caught
// all pointer input, so tapping the highlighted nav did nothing ("navigating the
// footer, nothing happens"). The scrim is now non-blocking (pointer-events:none),
// so the nav works while the tour rides along. This test proves both: the tour
// auto-starts for a signed-in parent, AND a nav tap navigates with it up.

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  // Signed-in parent, tour NOT marked seen → the essentials tour auto-starts.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true, tour: true })
  await page.goto('/board')
}

test('guided tour does not block the bottom nav', async ({ page }) => {
  await boot(page)
  // The tour auto-launches (centred welcome card first). This is the diagnosis.
  await page.locator('.tour').waitFor({ state: 'visible', timeout: 10_000 })

  // The bottom nav is dimmed behind the scrim — but a tap must still land.
  await page.locator('.hubnav a[href="/kitchen"]').click()
  await expect(page).toHaveURL(/\/kitchen$/)

  // And the tour is still riding along (not dismissed by the navigation).
  await expect(page.locator('.tour')).toBeVisible()
})

test('tour card names itself (capture)', async ({ page }) => {
  await boot(page)
  await page.locator('.tour').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('.tour__eyebrow').waitFor({ state: 'visible' })
  await page.screenshot({ path: 'e2e/screenshots/tour-welcome.png' })
  // Advance to the bottom-nav step so the spotlight ring shows too.
  await page.getByRole('button', { name: /Suivant|Next/ }).click()
  await page.locator('.tour__ring').waitFor({ state: 'visible' })
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'e2e/screenshots/tour-spotlight.png' })
})
