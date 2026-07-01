import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang } from './mocks'

// Capture offline feedback — locks the fix for the "one hole in never-lost": capture
// needs a live AI round-trip so it can't queue offline; it must TELL the user rather
// than silently eating the tap. Here we go offline, submit a capture, and assert an
// error line appears AND the typed text is kept.

const APP = (path: string, audience: Audience = 'parent', lang: Lang = 'fr') =>
  async (page: Page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience, lang, calm: true })
    await page.goto(path)
  }

async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('an offline capture surfaces a failure and keeps the typed text (never silently lost)', async ({ page }) => {
  await APP('/board')(page)
  await settle(page, '.hub')
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  await page.locator('.sheet__field input').fill('Acheter du lait')

  // Go offline. Wait for the offline bar — it rides the same useOnline() signal the
  // capture guard reads, so its appearance means the guard now sees us as offline
  // (otherwise a page.route mock would still fulfill the POST and it'd look "sent").
  await page.context().setOffline(true)
  await expect(page.locator('.offline-bar')).toBeVisible()

  await page.locator('.sheet form button[type="submit"]').first().click()

  // An error line appears (role=alert) and the typed text is still in the box.
  await expect(page.locator('.status-msg--error')).toBeVisible()
  await expect(page.locator('.sheet__field input')).toHaveValue('Acheter du lait')

  await page.context().setOffline(false)
})
