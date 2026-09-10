import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'

// THE DAY SCENE'S MEAL ROW OPENS ITS RECIPE — the same contract the week grid pins.
//
// Marc, from the phone, 2026-09-10: « we lost the ability to see the recipe directly
// in La cuisine when tapping a meal ». On the week grid the tap already went straight
// to the recipe (kitchen-meal-plan.spec.ts pins it). The surface that did NOT was the
// day scene — /kitchen/day/:date — where a tap on a meal row opened an in-place
// RENAME, and the recipe hid behind a small 📖 glyph. Once the day scene became THE
// day door (« Moments » retired, 2026-09-02) that is where a household taps a meal,
// so that is where the recipe went missing.
//
// The rule now, on both surfaces:
//   · a meal that resolves a recipe  → its row opens the recipe (one door, the row)
//   · a free-text meal               → its row renames in place (nothing else to show)
//   · rename for a LINKED meal       → the row's ⋯, under the word the tap used to carry
//
// Fixture (mocks.ts MEALS): « Spaghetti maison » is linked to rc1; « Salade César » is
// free text. Both sit in the supper slot on MMID, so the clock is frozen at BASE and
// the scene opened on that day.

async function openDay(page: Page) {
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(`/kitchen/day/${MMID}?vue=repas`)
  await expect(page.locator('.kitchen__meal-row').first()).toBeVisible({ timeout: 15_000 })
}

const row = (page: Page, title: string) => page.locator('.kitchen__meal-row', { hasText: title })

test('a linked meal\'s row opens its recipe — no glyph, no peek in between', async ({ page }) => {
  await openDay(page)
  const spag = row(page, 'Spaghetti maison')
  // The row body IS the door: it says so to a screen reader too.
  await expect(spag.locator('.kitchen__meal-main')).toHaveAttribute('aria-label', /Spaghetti maison/)
  // …and there is no second door to the same place.
  await expect(spag.locator('.kitchen__meal-btn')).toHaveCount(0)
  await spag.locator('.kitchen__meal-main').click()
  await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1$/)
})

test('a free-text meal\'s row still renames in place', async ({ page }) => {
  await openDay(page)
  const salade = row(page, 'Salade César')
  await salade.locator('.kitchen__meal-main').click()
  // No navigation — the row became a field, pre-filled with the title. Once it is a
  // field its title is an input VALUE, which `hasText` cannot see, so the row locator
  // above stops resolving: find the field itself.
  await expect(page).toHaveURL(/\/kitchen\/day\//)
  await expect(page.locator('.kitchen__meal-row .edit-field__input')).toHaveValue('Salade César')
})

test('renaming a LINKED meal lives in its ⋯, under « Modifier »', async ({ page }) => {
  await openDay(page)
  const spag = row(page, 'Spaghetti maison')
  await spag.getByRole('button', { name: /plus d.actions/i }).click()
  // The panel is portaled to <body> (ActionMenu) — scope INSIDE it. A page-wide
  // search for « Modifier » finds every free-text row's tap button first (that word
  // is their aria-label, and they precede the portal in DOM order): the first run of
  // this test opened the Crêpes row's rename and read its value back.
  const item = page.locator('.action-menu__panel[role="menu"]').getByText('Modifier', { exact: true })
  await expect(item).toBeVisible()
  await item.click()
  await expect(page.locator('.kitchen__meal-row .edit-field__input')).toHaveValue('Spaghetti maison')
})
