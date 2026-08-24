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

test('a section tour walks INSIDE the ＋ sheet, then closes it', async ({ page }) => {
  // A `sheet: true` step (lib/tourContent) has HubLayout hold the section's ＋
  // chooser open while the step is active, so the tour can spotlight the tiles
  // themselves; ending the tour lets the sheet go. Entry: the La liste intro
  // card's « Faire le tour » (tours pre-seen so essentials doesn't auto-start,
  // intros left un-dismissed so the button is there).
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
  await page.goto('/liste')
  await page.locator('.section-intro__tour').click()
  await page.locator('.tour').waitFor({ state: 'visible' })

  // Walk to the last step (the in-sheet tiles step): the ＋ sheet opens under
  // the tour and the spotlighted tile grid is really visible inside it.
  const next = page.getByRole('button', { name: /Suivant|Next/ })
  while (await next.isVisible()) await next.click()
  await expect(page.locator('.sheet.show [data-tour="add-tiles"]')).toBeVisible()
  await expect(page.locator('.tour__ring')).toBeVisible()

  // Finishing the tour releases the sheet it opened.
  await page.getByRole('button', { name: /Terminé|Done/ }).click()
  await expect(page.locator('.tour')).toHaveCount(0)
  await expect(page.locator('.sheet.show')).toHaveCount(0)
})

// The nav restructure gave Maison its OWN tour (id 'maison' — intro, the five
// sub-tab pills, the default Routines grid, the merged ＋ chooser); the old
// standalone 'routines'/'cercle' tours still exist (reached from their own Guide
// cards) but now both start on /maison too. « Les notes » split out with NO tour
// of its own — its section-intro card offers only « En savoir plus », never
// « Faire le tour ».
test('the Maison first-visit card offers its own tour, spotlighting the sub-tabs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
  await page.goto('/maison')
  const tourBtn = page.locator('.section-intro__tour')
  await expect(tourBtn).toBeVisible()
  await tourBtn.click()
  await page.locator('.tour').waitFor({ state: 'visible' })
  const next = page.getByRole('button', { name: /Suivant|Next/ })
  await next.click() // welcome → the five sub-tab pills step (data-tour="maison-sections")
  await expect(page.locator('.tour__ring')).toBeVisible()
})

test('the Les notes first-visit card has no tour to offer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
  await page.goto('/notes')
  await expect(page.locator('.section-intro')).toBeVisible()
  await expect(page.locator('.section-intro__tour')).toHaveCount(0)
  await expect(page.locator('.section-intro__more')).toBeVisible()
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
