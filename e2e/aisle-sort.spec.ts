import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang } from './mocks'

// Aisle sort (« Par allée ») — closes the §1 P1 gap: a core, logic-heavy list feature
// (the emoji→aisle classifier + the household's saved aisle order + per-item overrides)
// that shipped with ZERO e2e. Frontend-only harness, same as interactions.spec.ts:
// Vite + stubbed /api/**. The seeded list (Lait / Pain / Pommes / Couches) spans several
// aisles, so « Par allée » produces more than one group header.
//
// The whole choice now lives behind ONE button, « Allées » (an ActionMenu beside
// Circulaires / Déjà acheté): the list itself carries no permanent sort bar, and a
// row prints its aisle only when the menu's toggle asks for it. So every case here
// starts by opening that menu — which is also what pins it: if the menu stops
// opening, or a row moves out of it, these fail.

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

// The menu closes on every pick, so each choice reopens it.
const openAisles = (page: Page) => page.getByRole('button', { name: 'Allées', exact: true }).click()

test.describe('list aisle sort', () => {
  test.beforeEach(async ({ page }) => {
    await APP('/liste')(page)
    await settle(page, '.today-feed')
  })

  test('the « Allées » menu holds the order, and says which one is on', async ({ page }) => {
    const rows = page.locator('.today-feed > .list-rows > .list-row')
    await expect(rows).toHaveCount(4)

    // Default = « Mon ordre »: no group headers, and no per-row aisle tag either —
    // the tag is opt-in, so the row spends its width on the item's own name.
    await expect(page.locator('.list-aisle')).toHaveCount(0)
    await expect(page.locator('.list-row__aisle')).toHaveCount(0)

    // The menu carries the choice AND its state (a ✓ / aria-checked on the row in force).
    await openAisles(page)
    await expect(page.getByRole('menuitemradio', { name: 'Mon ordre' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('menuitemradio', { name: 'Par allée' })).toHaveAttribute('aria-checked', 'false')

    // Flip to « Par allée »: grouped under aisle headers, every row still present
    // (regroup, not drop), and the per-row tag stays off — the headers say it.
    await page.getByRole('menuitemradio', { name: 'Par allée' }).click()
    await expect(page.locator('.list-aisle').first()).toBeVisible()
    expect(await page.locator('.list-aisle').count()).toBeGreaterThan(1)
    await expect(page.locator('.list-row__aisle')).toHaveCount(0)
    await expect(rows).toHaveCount(4)

    // And the menu now says « Par allée » is the one in force.
    await openAisles(page)
    await expect(page.getByRole('menuitemradio', { name: 'Par allée' })).toHaveAttribute('aria-checked', 'true')
  })

  test('the aisle tag is a toggle in the menu — off, then on, without regrouping', async ({ page }) => {
    await expect(page.locator('.list-row__aisle')).toHaveCount(0)

    await openAisles(page)
    const tags = page.getByRole('menuitemcheckbox', { name: /l’allée de chaque article/ })
    await expect(tags).toHaveAttribute('aria-checked', 'false')
    await tags.click()

    // Every row prints its aisle now — and the list is NOT regrouped (still Mon ordre).
    await expect(page.locator('.list-row__aisle').first()).toBeVisible()
    await expect(page.locator('.list-aisle')).toHaveCount(0)

    // Off again from the same row.
    await openAisles(page)
    await page.getByRole('menuitemcheckbox', { name: /l’allée de chaque article/ }).click()
    await expect(page.locator('.list-row__aisle')).toHaveCount(0)
  })

  test('the per-device sort choice persists across a reload', async ({ page }) => {
    await openAisles(page)
    await page.getByRole('menuitemradio', { name: 'Par allée' }).click()
    await expect(page.locator('.list-aisle').first()).toBeVisible()
    await page.reload()
    await settle(page, '.today-feed')
    // Remembered via localStorage (LIST_SORT_KEY) — still grouped after the reload.
    await expect(page.locator('.list-aisle').first()).toBeVisible()
  })
})
