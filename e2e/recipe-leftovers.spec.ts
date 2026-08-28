import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// bmad/11 tier-2 #10: leftovers were unpostable from a recipe-backed meal. Tapping a
// planned dish ROUTES to /kitchen/recipe/:id, and that scene was the one surface with
// no door onto the Restants pool — you finished supper, tapped the dish, and had to
// walk back out to La cuisine to say there were leftovers.
//
// The door is « Il en reste ? » in the scene's ⋯ overflow (the same action the day
// editor and the board peek already offer, through the same shared hook).
test('a recipe posts its leftovers without leaving the scene', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posted: Record<string, unknown>[] = []
  await mockApi(page)
  await page.route('**/api/meal-leftovers**', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'lo-new' }) })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen')
  await expect(page.locator('.kitchen')).toBeVisible({ timeout: 15_000 })

  await page.locator('.subtabs__opt').nth(2).click() // Recettes
  await page.locator('.recipe-card').first().click()
  await expect(page.locator('.recipe-modal')).toBeVisible()

  const overflow = page.locator('.recipe-modal .action-menu__btn')
  await overflow.click()
  const announce = page.getByRole('menuitem', { name: 'Il en reste ?' })
  await expect(announce).toBeVisible()
  await announce.click()

  // It carries the recipe link, so the pool row can open the recipe it came from.
  await expect.poll(() => posted.length).toBe(1)
  expect(posted[0].title).toBeTruthy()
  expect(posted[0].recipeId).toBeTruthy()
  // No meal behind a recipe opened straight from the book.
  expect(posted[0].sourceMealId).toBeNull()

  // NO undo toast from here, and that is deliberate, not an omission: .recipe-modal
  // is z-index 80 and .undo-toast is 40, so an « Annuler » offered from inside this
  // scene is painted UNDERNEATH it — the exact bug cook mode shipped and fixed on
  // 2026-08-27. If a later change re-adds one, this assertion is the alarm.
  await expect(page.locator('.undo-toast')).toBeHidden()

  // The label flip is the confirmation instead, and a second tap can't double-post.
  await overflow.click()
  await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dans les restants' })).toBeDisabled()
  expect(posted).toHaveLength(1)
})
