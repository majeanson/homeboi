import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The garde-manger + the meal pools wear the same two faces as « La liste » and
// « Les notes » (lib/surfaceMode, the shared ModeToggle):
//
//   SIMPLE (the default) — rows keep their DO actions only: the check (and the
//     réserve's 🛍 restock). No ✏️/🗑 furniture.
//   AVANCÉ — the ✏️ rename (and the low list's 🗑 discard-without-buying, the
//     pools' ✏️/🗑) come back on every row. The ⚙ IS the non-touch door to
//     managing — there is no gesture fallback here, so the toggle can't regress.
//
// Guards the generalized pattern: default face carries no furniture, the ⚙ brings
// it back, the two flags are independent, and each survives a reload.

async function openPantry(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen?tab=pantry')
  await page.locator('.kitchen__low li').first().waitFor()
}

test('garde-manger: AVANCÉ puts ✏️/🗑 back on the low list', async ({ page }) => {
  await openPantry(page)

  // Simple: the low rows are check + name only — no RowActions furniture.
  const lowRows = page.locator('.kitchen__low li')
  const rowCount = await lowRows.count()
  expect(rowCount).toBeGreaterThan(0)
  await expect(page.locator('.kitchen__low .row-actions')).toHaveCount(0)
  // …and the use-soon list likewise.
  await expect(page.locator('.kitchen__soon .row-actions')).toHaveCount(0)

  const toggle = page.locator('.mode-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  // Every low row now carries the pair; a plain CLICK on ✏️ opens the inline rename.
  expect(await page.locator('.kitchen__low .row-actions').count()).toBe(rowCount)
  await page.locator('.kitchen__low .row-actions__btn').first().click()
  await expect(page.locator('.kitchen__low .checkrow__edit input, .kitchen__low .edit-field__input').first()).toBeVisible()
})

test('the garde-manger mode is device-local and survives a reload', async ({ page }) => {
  await openPantry(page)
  await page.locator('.mode-toggle').click()
  await expect(page.locator('.kitchen__low .row-actions').first()).toBeVisible()

  await page.reload()
  await page.locator('.kitchen__low li').first().waitFor()
  await expect(page.locator('.mode-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.kitchen__low .row-actions').first()).toBeVisible()
})

test('meal pools: their OWN flag folds the row furniture the same way', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await page.locator('.kitchen__idea-row').first().waitFor()

  // Simple: an idea row is its chip (tap = plan) — no ✏️/🗑.
  await expect(page.locator('.kitchen__idea-row .row-actions')).toHaveCount(0)

  // The pools' ⚙ is a separate flag from the garde-manger's. Both inline pools
  // (Idées + Restants) carry one — same flag, so clicking either flips both.
  const toggle = page.locator('.kitchen__ideas .mode-toggle').first()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.kitchen__idea-row .row-actions').first()).toBeVisible()

  // Flipping the pools did not flip the garde-manger.
  await page.goto('/kitchen?tab=pantry')
  await page.locator('.kitchen__low li').first().waitFor()
  await expect(page.locator('.mode-toggle')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.kitchen__low .row-actions')).toHaveCount(0)
})
