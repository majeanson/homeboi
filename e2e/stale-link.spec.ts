import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// A deep link that no longer points at anything (bmad/12 #26).
//
// These scenes always redirected when the thing was gone — silently. From the
// user's side that reads as a broken tap: you follow a link a family member
// texted and land on La cuisine with no explanation. Now the toast bar says the
// ordinary cause.
test.describe('stale deep links', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { surface: 'mobile' })
  })

  for (const [name, path] of [
    ['a recipe view', '/kitchen/recipe/nope-does-not-exist'],
    ['cook mode', '/kitchen/recipe/nope-does-not-exist/cook'],
  ] as const) {
    test(`${name} for a deleted recipe lands on La cuisine AND says why`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/kitchen$/)
      await expect(page.locator('.undo-toast')).toContainText(/n’existe plus|is gone/)
    })
  }

  test('the notice has nothing to undo', async ({ page }) => {
    // It's the 'notice' kind: the same bar, but no « Annuler » — there is no
    // action to take back, only an explanation.
    await page.goto('/kitchen/recipe/nope-does-not-exist')
    await expect(page.locator('.undo-toast')).toBeVisible()
    await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
  })
})
