import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang } from './mocks'

// Aisle sort (« Par allée ») — closes the §1 P1 gap: a core, logic-heavy list feature
// (the emoji→aisle classifier + the household's saved aisle order + per-item overrides)
// that shipped with ZERO e2e. Frontend-only harness, same as interactions.spec.ts:
// Vite + stubbed /api/**. The seeded list (Lait / Pain / Pommes / Couches) spans several
// aisles, so « Par allée » produces more than one group header.

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

test.describe('list aisle sort', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
  })

  test('Mon ordre shows per-row aisle tags + no headers; Par allée groups under aisle headers', async ({ page }) => {
    const rows = page.locator('.today-feed > .list-rows > .list-row')
    await expect(rows).toHaveCount(4)

    // Default = « Mon ordre »: the aisle rides as a small per-row tag, NO group headers.
    await expect(page.locator('.list-aisle')).toHaveCount(0)
    await expect(page.locator('.list-row__aisle').first()).toBeVisible()

    // Flip to « Par allée ».
    await page.getByRole('button', { name: 'Par allée', exact: true }).click()

    // Now grouped: aisle headers appear (the seeded items span >1 aisle), the per-row
    // tags are gone (headers replace them), and every row is still present (regroup, not drop).
    await expect(page.locator('.list-aisle').first()).toBeVisible()
    expect(await page.locator('.list-aisle').count()).toBeGreaterThan(1)
    await expect(page.locator('.list-row__aisle')).toHaveCount(0)
    await expect(rows).toHaveCount(4)
  })

  test('the per-device sort choice persists across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Par allée', exact: true }).click()
    await expect(page.locator('.list-aisle').first()).toBeVisible()
    await page.reload()
    await settle(page, '.today-feed')
    // Remembered via localStorage (LIST_SORT_KEY) — still grouped after the reload.
    await expect(page.locator('.list-aisle').first()).toBeVisible()
  })
})
