import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// SectionAdd — the shared "open this section's composer" ＋. A permanently-open add
// field is the one thing on a glance surface you can't scan past, and the
// garde-manger stacked THREE of them (à utiliser bientôt · la réserve · ce qui
// s'achève) so its whole first screen was fields and the two or three things
// actually running low sat below the fold.
//
// Guards the trade: the fields really are gone until asked for, the ＋ really opens
// them AND lands the caret (an expand that costs a second tap is worse than the box
// it replaced), writing really folds them away again, and a read-only guest gets no
// ＋ at all.

const openPantry = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
  await page.goto('/kitchen?tab=pantry')
  await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Ce qui s’achève' })).toBeVisible()
}

test('the garde-manger leads with its lists — every add box waits behind a ＋', async ({ page }) => {
  await openPantry(page)

  // Three sections, three ＋, and not one open field.
  await expect(page.locator('.sec-label__actbtn')).toHaveCount(3)
  await expect(page.locator('.edit-field__input')).toHaveCount(0)

  // Which means the three lists fit one screen: the last section's heading is
  // visible without scrolling (it was pushed under the fold by the composers).
  const heading = page.getByRole('heading', { name: 'Ce qui s’achève' })
  const inView = await heading.evaluate((el) => {
    const b = el.getBoundingClientRect()
    return b.top >= 0 && b.bottom <= window.innerHeight
  })
  expect(inView, 'the third section fits the first screen').toBe(true)
})

test('the ＋ opens the field focused, and writing folds it away', async ({ page }) => {
  await openPantry(page)

  const plus = page.getByRole('button', { name: 'Ajouter un aliment' }).first()
  await expect(plus).toHaveAttribute('aria-expanded', 'false')
  await plus.click()
  await expect(plus).toHaveAttribute('aria-expanded', 'true')

  // One tap opens AND focuses.
  const field = page.locator('.edit-field__input').first()
  await expect(field).toBeFocused()

  await field.fill('épinards')
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/use-soon') && r.method() === 'POST'),
    field.press('Enter'),
  ])
  // Written → folded away, and the section is a list again.
  await expect(plus).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.edit-field__input')).toHaveCount(0)
})

test('a read-only guest gets no ＋ at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/kitchen?tab=pantry')
  await expect(page.getByRole('heading', { name: 'Ce qui s’achève' })).toBeVisible()

  await expect(page.locator('.sec-label__actbtn')).toHaveCount(0)
  await expect(page.locator('.edit-field__input')).toHaveCount(0)
})

test('La liste’s shortcuts are quiet chips, not full-width bars', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
  await page.goto('/liste')
  await page.locator('.list-rows').waitFor({ state: 'visible', timeout: 15_000 })

  const row = page.locator('.list-actions--quiet')
  await expect(row).toBeVisible()
  // Each shortcut sits at its NATURAL width — none of them claims the whole line
  // (the regression: three solid bars stacked above the list they exist to fill).
  const rowW = (await row.boundingBox())!.width
  for (const b of await row.locator('.btn').all()) {
    const w = (await b.boundingBox())!.width
    expect(w, 'a shortcut chip must not span the row').toBeLessThan(rowW * 0.75)
  }
  // …and the first list item still starts above the fold.
  const first = page.locator('.list-rows > *').first()
  const top = (await first.boundingBox())!.y
  expect(top, 'the list starts on the first screen').toBeLessThan(400)
})
