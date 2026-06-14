import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// La cuisine meal-planning UX: the ＋ "Planifier un repas" is a day picker that
// opens that day's Gérer sheet (one editor, two entry points); the Gérer sheet
// lists slots chronologically (déjeuner → dîner → collation → souper, note last);
// and the recipe builder fills the screen (no stale-keyboard dead space).

async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

test('＋ Planifier un repas → day picker → opens that day’s Gérer sheet', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
  // Kitchen ＋ defaults to the meal mode → the day picker is shown.
  const dayChip = page.locator('.addsheet__days .chip').first()
  await expect(dayChip).toBeVisible()
  await dayChip.click()

  // The day's full Gérer sheet is what's now shown (the add sheet closed behind
  // it); both use .sheet, so assert the VISIBLE sheet holds the day sections.
  await expect(page.locator('.sheet.show .day-mng__sec').first()).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/kitchen/)
  // ?manage is consumed (one-shot trigger), not left in the URL.
  await expect(page).not.toHaveURL(/manage=/)
})

test('Gérer sheet lists slots chronologically, note last', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })
  // Open the first day's Gérer sheet straight from the grid.
  await page.locator('.kitchen__day-open').first().click()
  await expect(page.locator('.day-mng__sec').first()).toBeVisible({ timeout: 10_000 })

  const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
  const order = heads.map((h) => h.trim())
  expect(order).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Note du jour'])

  // The add affordance shares the slot's header line (not a row of its own).
  await expect(page.locator('.day-mng__sec-head-row .kitchen__slot-add').first()).toBeVisible()
})

test('recipe builder fills the screen (no stale-keyboard dead space)', async ({ page }) => {
  await boot(page)
  await page.goto('/kitchen/recipe/new')
  const modal = page.locator('.recipe-modal')
  await expect(modal).toBeVisible({ timeout: 15_000 })
  // No keyboard → the scene must fill the viewport, not a shrunken --vvh band.
  const kbOpen = await page.evaluate(() => document.documentElement.classList.contains('kb-open'))
  expect(kbOpen).toBe(false)
  const { h, vh } = await page.evaluate(() => ({
    h: (document.querySelector('.recipe-modal') as HTMLElement).getBoundingClientRect().height,
    vh: window.innerHeight,
  }))
  expect(h).toBeGreaterThanOrEqual(vh - 2)
})
