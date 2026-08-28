import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// bmad/11 tier-3, "cold kitchen grid flashes a Jan-1970 week (`weekStart ?? 0`)".
//
// The named site (the Kitchen grid) was already fixed — it holds a Skeleton until the
// meals payload lands. Sweeping the RULE rather than the site turned up a fifth
// consumer that was NOT guarded, and where the same epoch anchor was worse than a
// flash: `IdeasPage` feeds its labelled week straight into the ideas drawer's
// "plan it on…" day chips (MealPool → MealPlanPicker), so on a cold open a tap wrote
// a meal dated 1 Jan 1970. RecipeViewPage, AddSheet and nextMeal all already had the
// `weekStart ? … : []` guard; IdeasPage was the one of the five that didn't.
//
// Driven by never fulfilling /api/meals, which IS the cold first paint.
//
// NOTE ON THE ASSERTION: the first version of this spec looked for the string "1970"
// and passed with the bug planted — `formatWeekday` renders « jeudi », never a year,
// so the epoch was invisible to it. That is the "a guard that has never been red
// proves nothing" trap, and it only surfaced because the plant was actually run. The
// assertion is structural now: with no anchor there must be no day chip to tap.

test('the ideas drawer offers no day to plan on until the real week anchor arrives', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  // Cold: the meals payload never lands, so `weekStart` stays at its `?? 0` fallback.
  await page.route('**/api/meals**', () => {
    /* deliberately never fulfilled */
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/idees')
  await expect(page.locator('.scene.ideas-drawer')).toBeVisible()

  // Open an idea's plan picker — the door the day chips live behind.
  await page.locator('.kitchen__idea-name').first().click()
  const picker = page.locator('.meal-plan-pick')
  await expect(picker, 'the picker itself still opens — only its days are withheld').toBeVisible()

  // The row of "plan it on…" days must be EMPTY. With the epoch anchor it held ten
  // weekday chips, every one of them writing a meal in January 1970.
  await expect(picker.locator('.meal-plan-pick__days .chip')).toHaveCount(0)
})

test('once the week anchor lands, the days are offered again', async ({ page }) => {
  // The other side, so the guard can't be "fixed" by simply never showing days.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/kitchen/idees')
  await expect(page.locator('.scene.ideas-drawer')).toBeVisible()

  await page.locator('.kitchen__idea-name').first().click()
  const days = page.locator('.meal-plan-pick .meal-plan-pick__days .chip')
  await expect(days.first()).toBeVisible()
  expect(await days.count()).toBeGreaterThan(0)
})
