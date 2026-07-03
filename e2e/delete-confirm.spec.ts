import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Destructive deletes that had NO confirm and NO undo now go through the shared
// useConfirm dialog (REVIEW-PASS quick-win: guard accidental data loss). This drives
// one representative site end-to-end — the list-item edit scene — proving the confirm
// gates the delete: Cancel keeps the row, Confirm sends the DELETE.
test.use({ hasTouch: true })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 860 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
})

test('deleting a list item from the edit scene asks to confirm first', async ({ page }) => {
  await page.goto('/liste/item/l2') // « Pain », from the board fixture

  // Cancel path — the delete must NOT fire.
  let deletes = 0
  await page.route('**/api/list', (route) => {
    if (route.request().method() === 'DELETE') deletes++
    return route.fallback()
  })

  await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
  const dialog = page.locator('.confirm')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialog).toBeHidden()
  expect(deletes).toBe(0)
  await expect(page).toHaveURL(/\/liste\/item\/l2/) // still on the scene

  // Confirm path — the DELETE fires.
  const del = page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'DELETE')
  await page.getByRole('button', { name: 'Supprimer de la liste' }).click()
  await page.locator('.confirm').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await del
})
